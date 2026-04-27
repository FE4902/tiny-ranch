#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const DEFAULT_OUTPUT_DIR = path.join(repoRoot, 'artifacts/mvp-launch-handoff')
const SUMMARY_JSON_NAME = 'mvp-launch-handoff-summary.json'
const SUMMARY_MD_NAME = 'mvp-launch-handoff-summary.md'
const ARTIFACT_INDEX_JSON_NAME = 'mvp-launch-handoff-artifact-index.json'
const LOG_DIR_NAME = 'logs'
const REPORT_DIR_NAME = 'reports'
const MAX_BUFFER_BYTES = 128 * 1024 * 1024

const GO_NO_GO_CRITERIA = [
  'Unified MVP release-candidate gate passes with no failed or skipped stages.',
  'Production launch-shell preview smoke passes on desktop and mobile Chromium projects.',
  'Handoff artifact records current git/build metadata and points to nested gate artifacts.',
  'Rollback paths for build profile, telemetry sink, retention tuning, and Barn release state are documented.',
]

const OWNER_FOLLOW_UPS = [
  'Board or CTO reviews mvp-launch-handoff-summary.md before deploy approval.',
  'Release owner deploys the reviewed commit with the intended telemetry sink configuration.',
  'Release owner reruns pnpm run test:smoke:launch-shell against the deployed preview or production target.',
  'Gameplay owner monitors first-session, retention, Barn order, and telemetry delivery signals after launch.',
]

const ROLLBACKS = [
  {
    id: 'build_profile',
    title: 'Build profile rollback',
    commands: ['pnpm run build:rollback', 'pnpm run bundle:measure:rollback'],
    notes:
      'Set VITE_EXPERIMENT_PHASER_BUILD=package for the deployment build if the default core Phaser profile blocks production boot.',
    docs: ['README.md', 'package.json'],
  },
  {
    id: 'telemetry_sink',
    title: 'Telemetry sink rollback',
    commands: [
      'VITE_TELEMETRY_SINK=none pnpm run build',
      'VITE_TELEMETRY_SINK=console pnpm run build',
      'pnpm run test:smoke:launch-shell',
    ],
    notes:
      'Remove VITE_POSTHOG_API_KEY and optional PostHog overrides from deployment secrets before redeploying with none or console delivery.',
    docs: ['docs/ver-122-production-launch-shell.md', 'docs/ver-42-startup-telemetry-baseline.md'],
  },
  {
    id: 'retention_tuning',
    title: 'Retention tuning rollback',
    commands: [
      'VITE_RETENTION_TUNING_PACK=safe-default-v1 pnpm run build',
      'pnpm run gate:retention:release',
      'pnpm run gate:mvp:release',
    ],
    notes:
      'Use the built-in safe-default-v1 pack or the retentionKillSwitch smoke query for local isolation, then rerun the release gates before redeploy.',
    docs: ['docs/ver-97-retention-tuning-pack-loader.md', 'docs/ver-102-retention-release-gate-orchestrator.md'],
  },
  {
    id: 'barn_release_state',
    title: 'Barn release rollback',
    commands: ['git revert <barn-lane-commit>', 'pnpm run gate:barn:mvp', 'pnpm run gate:mvp:release'],
    notes:
      'Barn MVP has no production env kill switch in this build. Roll back by reverting the Barn lane change set or source-disabling Barn entry/config, then rerun the Barn and MVP gates.',
    docs: ['docs/ver-120-barn-mvp-release-gate.md', 'docs/ver-118-barn-mobile-qa.md'],
  },
]

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/run-mvp-launch-handoff.mjs [options]',
      '',
      'Options:',
      '  --output-dir=<path>       Output directory for handoff summary and launch-shell artifacts.',
      '  --gate-output-dir=<path>  Output directory for the nested MVP release-candidate gate.',
      '  --use-existing-gate      Consume an existing MVP gate summary instead of rerunning the gate.',
      '  --no-fail-fast           Pass --no-fail-fast to the nested MVP release-candidate gate.',
      '  --help                   Show this message.',
      '',
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    gateOutputDir: null,
    useExistingGate: false,
    gateFailFast: true,
  }

  for (const arg of argv) {
    if (arg === '--') {
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg === '--use-existing-gate') {
      options.useExistingGate = true
      continue
    }

    if (arg === '--no-fail-fast') {
      options.gateFailFast = false
      continue
    }

    if (arg.startsWith('--output-dir=')) {
      const rawPath = arg.slice('--output-dir='.length).trim()
      if (rawPath.length === 0) {
        throw new Error('--output-dir requires a non-empty path.')
      }
      options.outputDir = path.resolve(process.cwd(), rawPath)
      continue
    }

    if (arg.startsWith('--gate-output-dir=')) {
      const rawPath = arg.slice('--gate-output-dir='.length).trim()
      if (rawPath.length === 0) {
        throw new Error('--gate-output-dir requires a non-empty path.')
      }
      options.gateOutputDir = path.resolve(process.cwd(), rawPath)
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!options.gateOutputDir) {
    options.gateOutputDir = path.join(options.outputDir, 'mvp-release-candidate-gate')
  }

  return options
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
}

function runProcess(command, args, env = {}) {
  const startedAtMs = Date.now()
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
    maxBuffer: MAX_BUFFER_BYTES,
  })
  const finishedAtMs = Date.now()

  return {
    exitCode: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs: finishedAtMs - startedAtMs,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    errorMessage: result.error
      ? result.error instanceof Error
        ? result.error.message
        : String(result.error)
      : null,
  }
}

function toRelativeRepoPath(filePath) {
  const relativePath = path.relative(repoRoot, filePath)
  return relativePath.length === 0 ? '.' : relativePath
}

function fileExists(filePath) {
  return fs.existsSync(filePath)
}

function addIfExists(artifactPaths, filePath) {
  if (fileExists(filePath)) {
    artifactPaths.push(toRelativeRepoPath(filePath))
  }
}

function writeLogs(outputDir, stageId, result) {
  const logsDir = path.join(outputDir, LOG_DIR_NAME)
  ensureDir(logsDir)

  const stdoutPath = path.join(logsDir, `${stageId}.stdout.log`)
  const stderrPath = path.join(logsDir, `${stageId}.stderr.log`)

  fs.writeFileSync(stdoutPath, result.stdout, 'utf8')
  fs.writeFileSync(stderrPath, result.stderr, 'utf8')

  return {
    stdoutPath,
    stderrPath,
  }
}

function readJsonFile(filePath) {
  if (!fileExists(filePath)) {
    return null
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (_error) {
    return null
  }
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-9;]*m/g, '')
}

function collectPlaywrightFailures(report) {
  const failures = []

  const visitSuite = (suite, parentTitles = []) => {
    if (!suite || typeof suite !== 'object') {
      return
    }

    const suiteTitle = typeof suite.title === 'string' && suite.title.length > 0 ? suite.title : null
    const nextParentTitles = suiteTitle ? [...parentTitles, suiteTitle] : parentTitles

    if (Array.isArray(suite.specs)) {
      for (const spec of suite.specs) {
        const specTitle = typeof spec.title === 'string' ? spec.title : 'unknown spec'
        if (!Array.isArray(spec.tests)) {
          continue
        }

        for (const test of spec.tests) {
          const outcome = typeof test.outcome === 'string' ? test.outcome : null
          const failedResults = Array.isArray(test.results)
            ? test.results.filter((result) => result.status !== 'passed' && result.status !== 'skipped')
            : []
          if (outcome !== 'unexpected' && outcome !== 'flaky' && failedResults.length === 0) {
            continue
          }

          const firstFailedResult = failedResults[0] ?? null
          const firstError = Array.isArray(firstFailedResult?.errors)
            ? firstFailedResult.errors[0]
            : firstFailedResult?.error
          const rawMessage =
            firstError && typeof firstError === 'object' && 'message' in firstError
              ? firstError.message
              : firstError
          const message =
            typeof rawMessage === 'string' && rawMessage.trim().length > 0
              ? stripAnsi(rawMessage).split(/\r?\n/)[0]
              : 'No Playwright error message captured.'

          failures.push({
            title: [...nextParentTitles, specTitle].join(' > '),
            outcome,
            status: firstFailedResult?.status ?? null,
            message,
          })
        }
      }
    }

    if (Array.isArray(suite.suites)) {
      for (const childSuite of suite.suites) {
        visitSuite(childSuite, nextParentTitles)
      }
    }
  }

  if (Array.isArray(report?.suites)) {
    for (const suite of report.suites) {
      visitSuite(suite)
    }
  }

  return failures
}

function parsePlaywrightMetrics(reportPath) {
  const report = readJsonFile(reportPath)
  if (!report || typeof report !== 'object') {
    return {
      total: null,
      passed: null,
      failed: null,
      skipped: null,
      durationMs: null,
      failures: [],
      reportPath: toRelativeRepoPath(reportPath),
    }
  }

  const stats = report.stats && typeof report.stats === 'object' ? report.stats : null
  if (!stats) {
    return {
      total: null,
      passed: null,
      failed: null,
      skipped: null,
      durationMs: null,
      failures: collectPlaywrightFailures(report),
      reportPath: toRelativeRepoPath(reportPath),
    }
  }

  const passed = Number.parseInt(String(stats.expected ?? 0), 10)
  const failed =
    Number.parseInt(String(stats.unexpected ?? 0), 10) + Number.parseInt(String(stats.flaky ?? 0), 10)
  const skipped = Number.parseInt(String(stats.skipped ?? 0), 10)

  return {
    total: Math.max(0, passed + failed + skipped),
    passed,
    failed,
    skipped,
    durationMs: Number.parseInt(String(stats.duration ?? 0), 10),
    failures: collectPlaywrightFailures(report),
    reportPath: toRelativeRepoPath(reportPath),
  }
}

function shellQuote(arg) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(arg)) {
    return arg
  }

  return JSON.stringify(arg)
}

function formatCommand(command) {
  return command.map((arg) => shellQuote(String(arg))).join(' ')
}

function resolveGitMetadata() {
  const commit = runProcess('git', ['rev-parse', 'HEAD'])
  const shortCommit = runProcess('git', ['rev-parse', '--short', 'HEAD'])
  const branch = runProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  const status = runProcess('git', ['status', '--porcelain'])

  return {
    commit: commit.exitCode === 0 ? commit.stdout.trim() : null,
    shortCommit: shortCommit.exitCode === 0 ? shortCommit.stdout.trim() : null,
    branch: branch.exitCode === 0 ? branch.stdout.trim() : null,
    dirty: status.exitCode === 0 ? status.stdout.trim().length > 0 : null,
    dirtyFiles:
      status.exitCode === 0
        ? status.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        : [],
  }
}

function readPackageMetadata() {
  const packageJson = readJsonFile(path.join(repoRoot, 'package.json'))
  return {
    name: typeof packageJson?.name === 'string' ? packageJson.name : null,
    version: typeof packageJson?.version === 'string' ? packageJson.version : null,
  }
}

function collectMvpGateArtifactPaths(gateOutputDir) {
  const artifactPaths = []
  addIfExists(artifactPaths, path.join(gateOutputDir, 'mvp-release-candidate-gate-summary.json'))
  addIfExists(artifactPaths, path.join(gateOutputDir, 'mvp-release-candidate-gate-summary.md'))
  addIfExists(artifactPaths, path.join(gateOutputDir, 'mvp-release-candidate-gate-artifact-index.json'))
  addIfExists(artifactPaths, path.join(gateOutputDir, 'retention-release-gate/retention-release-gate-summary.json'))
  addIfExists(artifactPaths, path.join(gateOutputDir, 'retention-release-gate/retention-release-gate-summary.md'))
  addIfExists(
    artifactPaths,
    path.join(gateOutputDir, 'retention-release-gate/retention-release-gate-artifact-index.json'),
  )
  addIfExists(artifactPaths, path.join(gateOutputDir, 'barn-mvp-release-gate/barn-mvp-release-gate-summary.json'))
  addIfExists(artifactPaths, path.join(gateOutputDir, 'barn-mvp-release-gate/barn-mvp-release-gate-summary.md'))
  addIfExists(
    artifactPaths,
    path.join(gateOutputDir, 'barn-mvp-release-gate/barn-mvp-release-gate-artifact-index.json'),
  )
  return artifactPaths
}

function parseMvpGateMetrics(gateOutputDir) {
  const summaryPath = path.join(gateOutputDir, 'mvp-release-candidate-gate-summary.json')
  const parsed = readJsonFile(summaryPath)
  const summary = parsed && typeof parsed === 'object' ? parsed.summary : null

  return {
    summaryPath: toRelativeRepoPath(summaryPath),
    overallStatus:
      summary && typeof summary.overallStatus === 'string' ? summary.overallStatus : null,
    stageCount:
      summary && typeof summary.stageCount === 'number' && Number.isFinite(summary.stageCount)
        ? summary.stageCount
        : null,
    passed: summary && typeof summary.passed === 'number' && Number.isFinite(summary.passed) ? summary.passed : null,
    failed: summary && typeof summary.failed === 'number' && Number.isFinite(summary.failed) ? summary.failed : null,
    skipped:
      summary && typeof summary.skipped === 'number' && Number.isFinite(summary.skipped)
        ? summary.skipped
        : null,
    totalDurationMs:
      summary && typeof summary.totalDurationMs === 'number' && Number.isFinite(summary.totalDurationMs)
        ? summary.totalDurationMs
        : null,
    failures: Array.isArray(parsed?.failures) ? parsed.failures : [],
  }
}

function buildReleaseGateStage(options) {
  const command = options.gateFailFast
    ? ['pnpm', 'run', 'gate:mvp:release', `--output-dir=${options.gateOutputDir}`]
    : ['pnpm', 'run', 'gate:mvp:release', `--output-dir=${options.gateOutputDir}`, '--no-fail-fast']
  const artifactPaths = collectMvpGateArtifactPaths(options.gateOutputDir)
  let result = null
  let logPaths = null

  if (!options.useExistingGate) {
    process.stdout.write('[mvp-launch-handoff] running release_candidate_gate\n')
    result = runProcess(command[0], command.slice(1))
    logPaths = writeLogs(options.outputDir, 'release_candidate_gate', result)
    artifactPaths.push(toRelativeRepoPath(logPaths.stdoutPath))
    artifactPaths.push(toRelativeRepoPath(logPaths.stderrPath))
  }

  const metrics = parseMvpGateMetrics(options.gateOutputDir)
  const summaryExists = fileExists(path.join(options.gateOutputDir, 'mvp-release-candidate-gate-summary.json'))
  const passed =
    summaryExists &&
    metrics.overallStatus === 'pass' &&
    (options.useExistingGate || (result && result.exitCode === 0))

  if (result?.errorMessage) {
    metrics.error = result.errorMessage
  }

  if (!summaryExists) {
    metrics.error = 'MVP release-candidate gate summary was not found.'
  }

  return {
    id: 'release_candidate_gate',
    title: 'Unified MVP release-candidate gate',
    sourceIssue: 'VER-121',
    status: passed ? 'pass' : 'fail',
    owner: 'release_candidate_gate',
    command: options.useExistingGate ? `consume ${toRelativeRepoPath(options.gateOutputDir)}` : formatCommand(command),
    commandParts: options.useExistingGate ? [] : command,
    docs: ['docs/ver-121-mvp-release-candidate-gate.md'],
    coverage: [
      'production_build',
      'bundle_budget',
      'desktop_core_smoke',
      'mobile_core_touch_smoke',
      'save_migration_smoke',
      'retention_release_gate',
      'barn_mvp_gate',
    ],
    durationMs: result?.durationMs ?? metrics.totalDurationMs ?? 0,
    startedAt: result?.startedAt ?? null,
    finishedAt: result?.finishedAt ?? null,
    exitCode: result?.exitCode ?? null,
    metrics,
    artifactPaths: [...new Set([...artifactPaths, ...collectMvpGateArtifactPaths(options.gateOutputDir)])],
    stdoutLogPath: logPaths ? toRelativeRepoPath(logPaths.stdoutPath) : null,
    stderrLogPath: logPaths ? toRelativeRepoPath(logPaths.stderrPath) : null,
  }
}

function buildLaunchShellStage(options) {
  process.stdout.write('[mvp-launch-handoff] running launch_shell_preview_smoke\n')
  const reportsDir = path.join(options.outputDir, REPORT_DIR_NAME)
  ensureDir(reportsDir)

  const reportPath = path.join(reportsDir, 'launch_shell_preview_smoke.playwright.json')
  const command = ['pnpm', 'exec', 'playwright', 'test', 'tests/smoke/launch-shell.spec.ts', '--reporter=json']
  const result = runProcess(command[0], command.slice(1), {
    PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
  })
  const logPaths = writeLogs(options.outputDir, 'launch_shell_preview_smoke', result)
  const metrics = parsePlaywrightMetrics(reportPath)

  if (result.errorMessage) {
    metrics.error = result.errorMessage
  }

  return {
    id: 'launch_shell_preview_smoke',
    title: 'Production launch-shell preview smoke',
    sourceIssue: 'VER-122',
    status: result.exitCode === 0 ? 'pass' : 'fail',
    owner: 'launch_shell',
    command: formatCommand(command),
    commandParts: command,
    docs: ['docs/ver-122-production-launch-shell.md'],
    coverage: [
      'production_preview_build',
      'desktop_metadata_boot',
      'mobile_metadata_boot',
      'manifest_icon_share_assets',
      'ranch_scene_smoke_harness_ready',
    ],
    durationMs: result.durationMs,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    exitCode: result.exitCode,
    metrics,
    artifactPaths: [
      toRelativeRepoPath(reportPath),
      toRelativeRepoPath(logPaths.stdoutPath),
      toRelativeRepoPath(logPaths.stderrPath),
      'dist',
      'public/site.webmanifest',
      'public/favicon.svg',
      'public/apple-touch-icon.png',
      'public/share-card.svg',
    ],
    stdoutLogPath: toRelativeRepoPath(logPaths.stdoutPath),
    stderrLogPath: toRelativeRepoPath(logPaths.stderrPath),
  }
}

function buildFailureList(stages) {
  return stages
    .filter((stage) => stage.status === 'fail')
    .map((stage) => {
      const failures = Array.isArray(stage.metrics.failures) ? stage.metrics.failures : []
      return {
        stageId: stage.id,
        stageTitle: stage.title,
        sourceIssue: stage.sourceIssue,
        owner: stage.owner,
        command: stage.command,
        exitCode: stage.exitCode,
        ownerDocs: stage.docs,
        artifactPaths: stage.artifactPaths,
        stdoutLogPath: stage.stdoutLogPath,
        stderrLogPath: stage.stderrLogPath,
        firstFailure: failures[0] ?? null,
        nestedFailures: failures,
        error: stage.metrics.error ?? null,
      }
    })
}

function buildArtifactIndex(summary) {
  return {
    schemaVersion: 1,
    issueIdentifier: 'VER-123',
    generatedAt: summary.generatedAt,
    decision: summary.decision,
    artifacts: {
      summaryJsonPath: summary.jsonArtifactPath,
      summaryMarkdownPath: summary.markdownArtifactPath,
      artifactIndexPath: summary.artifactIndexPath,
      logsPath: summary.logsPath,
      reportsPath: summary.reportsPath,
    },
    linkedGateArtifacts: summary.linkedGateArtifacts,
    stages: summary.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      sourceIssue: stage.sourceIssue,
      status: stage.status,
      owner: stage.owner,
      command: stage.command,
      ownerDocs: stage.docs,
      coverage: stage.coverage,
      stdoutLogPath: stage.stdoutLogPath,
      stderrLogPath: stage.stderrLogPath,
      artifactPaths: stage.artifactPaths,
    })),
  }
}

function buildLinkedGateArtifacts(options) {
  return {
    releaseCandidateGate: {
      sourceIssue: 'VER-121',
      summaryJsonPath: toRelativeRepoPath(
        path.join(options.gateOutputDir, 'mvp-release-candidate-gate-summary.json'),
      ),
      summaryMarkdownPath: toRelativeRepoPath(
        path.join(options.gateOutputDir, 'mvp-release-candidate-gate-summary.md'),
      ),
      artifactIndexPath: toRelativeRepoPath(
        path.join(options.gateOutputDir, 'mvp-release-candidate-gate-artifact-index.json'),
      ),
    },
    retentionGate: {
      summaryJsonPath: toRelativeRepoPath(
        path.join(options.gateOutputDir, 'retention-release-gate/retention-release-gate-summary.json'),
      ),
      summaryMarkdownPath: toRelativeRepoPath(
        path.join(options.gateOutputDir, 'retention-release-gate/retention-release-gate-summary.md'),
      ),
      artifactIndexPath: toRelativeRepoPath(
        path.join(options.gateOutputDir, 'retention-release-gate/retention-release-gate-artifact-index.json'),
      ),
    },
    barnGate: {
      sourceIssue: 'VER-120',
      summaryJsonPath: toRelativeRepoPath(
        path.join(options.gateOutputDir, 'barn-mvp-release-gate/barn-mvp-release-gate-summary.json'),
      ),
      summaryMarkdownPath: toRelativeRepoPath(
        path.join(options.gateOutputDir, 'barn-mvp-release-gate/barn-mvp-release-gate-summary.md'),
      ),
      artifactIndexPath: toRelativeRepoPath(
        path.join(options.gateOutputDir, 'barn-mvp-release-gate/barn-mvp-release-gate-artifact-index.json'),
      ),
    },
    launchShell: {
      sourceIssue: 'VER-122',
      reportPath: toRelativeRepoPath(
        path.join(options.outputDir, REPORT_DIR_NAME, 'launch_shell_preview_smoke.playwright.json'),
      ),
      docsPath: 'docs/ver-122-production-launch-shell.md',
    },
  }
}

function buildSummary(options, stages) {
  const generatedAt = new Date().toISOString()
  const passed = stages.filter((stage) => stage.status === 'pass').length
  const failed = stages.filter((stage) => stage.status === 'fail').length
  const totalDurationMs = stages.reduce((sum, stage) => sum + stage.durationMs, 0)
  const summaryJsonPath = path.join(options.outputDir, SUMMARY_JSON_NAME)
  const summaryMarkdownPath = path.join(options.outputDir, SUMMARY_MD_NAME)
  const artifactIndexPath = path.join(options.outputDir, ARTIFACT_INDEX_JSON_NAME)
  const overallStatus = failed === 0 ? 'pass' : 'fail'

  return {
    schemaVersion: 1,
    issueIdentifier: 'VER-123',
    generatedAt,
    handoff: {
      command: 'pnpm run release:handoff',
      outputDir: toRelativeRepoPath(options.outputDir),
      gateOutputDir: toRelativeRepoPath(options.gateOutputDir),
      useExistingGate: options.useExistingGate,
      gateFailFast: options.gateFailFast,
      package: readPackageMetadata(),
      git: resolveGitMetadata(),
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    },
    summary: {
      overallStatus,
      stageCount: stages.length,
      passed,
      failed,
      totalDurationMs,
    },
    decision: {
      recommendation: overallStatus === 'pass' ? 'go' : 'no-go',
      reason:
        overallStatus === 'pass'
          ? 'All launch handoff gates passed.'
          : 'One or more launch handoff gates failed. Review failures before launch approval.',
      criteria: GO_NO_GO_CRITERIA,
    },
    linkedGateArtifacts: buildLinkedGateArtifacts(options),
    rollbackPaths: ROLLBACKS,
    ownerFollowUps: OWNER_FOLLOW_UPS,
    failures: buildFailureList(stages),
    stages,
    jsonArtifactPath: toRelativeRepoPath(summaryJsonPath),
    markdownArtifactPath: toRelativeRepoPath(summaryMarkdownPath),
    artifactIndexPath: toRelativeRepoPath(artifactIndexPath),
    logsPath: toRelativeRepoPath(path.join(options.outputDir, LOG_DIR_NAME)),
    reportsPath: toRelativeRepoPath(path.join(options.outputDir, REPORT_DIR_NAME)),
  }
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, '\\|')
}

function formatInlineCodeList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 'n/a'
  }

  return values.map((value) => `\`${escapeMarkdownCell(value)}\``).join('<br>')
}

function formatFailureDetail(failure) {
  if (failure.firstFailure) {
    return `${failure.firstFailure.title}: ${failure.firstFailure.message}`
  }

  if (failure.error) {
    return failure.error
  }

  return 'See stage logs and artifacts.'
}

function renderSummaryMarkdown(summary) {
  const lines = [
    '# Tiny Ranch MVP Launch Handoff',
    '',
    `- Generated at: ${summary.generatedAt}`,
    `- Recommendation: **${summary.decision.recommendation.toUpperCase()}**`,
    `- Overall status: **${summary.summary.overallStatus.toUpperCase()}**`,
    `- Stages: ${summary.summary.passed} passed, ${summary.summary.failed} failed`,
    `- Total runtime: ${summary.summary.totalDurationMs} ms`,
    `- Command: \`${summary.handoff.command}\``,
    `- Git: \`${summary.handoff.git.shortCommit ?? 'unknown'}\` on \`${summary.handoff.git.branch ?? 'unknown'}\`${summary.handoff.git.dirty ? ' (dirty worktree at generation time)' : ''}`,
    '',
    '## Go/No-Go Criteria',
    '',
  ]

  for (const criterion of summary.decision.criteria) {
    lines.push(`- ${criterion}`)
  }

  lines.push('', '## Stage Summary', '')
  lines.push('| Stage | Source | Status | Duration (ms) | Command | Artifacts |')
  lines.push('| --- | --- | --- | ---: | --- | --- |')

  for (const stage of summary.stages) {
    lines.push(
      `| ${escapeMarkdownCell(stage.title)} | ${escapeMarkdownCell(stage.sourceIssue)} | ${stage.status.toUpperCase()} | ${stage.durationMs} | \`${escapeMarkdownCell(stage.command)}\` | ${formatInlineCodeList(stage.artifactPaths)} |`,
    )
  }

  lines.push('', '## Linked Evidence', '')
  lines.push(`- Unified MVP gate ([VER-121](/VER/issues/VER-121)): \`${summary.linkedGateArtifacts.releaseCandidateGate.summaryMarkdownPath}\``)
  lines.push(`- Retention release gate: \`${summary.linkedGateArtifacts.retentionGate.summaryMarkdownPath}\``)
  lines.push(`- Barn MVP gate: \`${summary.linkedGateArtifacts.barnGate.summaryMarkdownPath}\``)
  lines.push(`- Launch-shell metadata smoke ([VER-122](/VER/issues/VER-122)): \`${summary.linkedGateArtifacts.launchShell.reportPath}\``)
  lines.push('')
  lines.push('## Failures', '')

  if (summary.failures.length === 0) {
    lines.push('No failed launch handoff stages.', '')
  } else {
    lines.push('| Stage | Exit | First Failure | Artifacts | Owner Docs |')
    lines.push('| --- | ---: | --- | --- | --- |')
    for (const failure of summary.failures) {
      lines.push(
        `| ${escapeMarkdownCell(failure.stageTitle)} | ${failure.exitCode ?? 'n/a'} | ${escapeMarkdownCell(formatFailureDetail(failure))} | ${formatInlineCodeList(failure.artifactPaths)} | ${formatInlineCodeList(failure.ownerDocs)} |`,
      )
    }
    lines.push('')
  }

  lines.push('## Rollback Paths', '')
  for (const rollback of summary.rollbackPaths) {
    lines.push(`### ${rollback.title}`)
    lines.push('')
    lines.push(`- Commands: ${formatInlineCodeList(rollback.commands)}`)
    lines.push(`- Notes: ${rollback.notes}`)
    lines.push(`- Docs: ${formatInlineCodeList(rollback.docs)}`)
    lines.push('')
  }

  lines.push('## Owner Follow-Ups', '')
  for (const followUp of summary.ownerFollowUps) {
    lines.push(`- ${followUp}`)
  }

  lines.push('')
  lines.push('## Artifact Paths', '')
  lines.push(`- Summary JSON: \`${summary.jsonArtifactPath}\``)
  lines.push(`- Summary Markdown: \`${summary.markdownArtifactPath}\``)
  lines.push(`- Artifact index JSON: \`${summary.artifactIndexPath}\``)
  lines.push(`- Logs: \`${summary.logsPath}\``)
  lines.push(`- Reports: \`${summary.reportsPath}\``)
  lines.push('')

  return `${lines.join('\n')}\n`
}

function renderConsoleSummary(summary) {
  const lines = [
    `[mvp-launch-handoff] ${summary.summary.overallStatus.toUpperCase()} recommendation=${summary.decision.recommendation}`,
    `[mvp-launch-handoff] summary: ${summary.markdownArtifactPath}`,
  ]

  for (const stage of summary.stages) {
    lines.push(`[mvp-launch-handoff] ${stage.status.toUpperCase()} ${stage.id}`)
  }

  return `${lines.join('\n')}\n`
}

function writeArtifacts(options, summary) {
  ensureDir(options.outputDir)

  const summaryJsonPath = path.join(options.outputDir, SUMMARY_JSON_NAME)
  const summaryMarkdownPath = path.join(options.outputDir, SUMMARY_MD_NAME)
  const artifactIndexPath = path.join(options.outputDir, ARTIFACT_INDEX_JSON_NAME)
  const artifactIndex = buildArtifactIndex(summary)

  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  fs.writeFileSync(summaryMarkdownPath, renderSummaryMarkdown(summary), 'utf8')
  fs.writeFileSync(artifactIndexPath, `${JSON.stringify(artifactIndex, null, 2)}\n`, 'utf8')
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  ensureDir(options.outputDir)

  const stages = [buildReleaseGateStage(options), buildLaunchShellStage(options)]
  const summary = buildSummary(options, stages)
  writeArtifacts(options, summary)
  process.stdout.write(renderConsoleSummary(summary))

  if (summary.summary.overallStatus !== 'pass') {
    process.exitCode = 1
  }
}

try {
  main()
} catch (error) {
  process.stderr.write(
    `[mvp-launch-handoff] failed: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
}
