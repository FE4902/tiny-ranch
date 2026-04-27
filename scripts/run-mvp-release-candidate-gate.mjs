#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const DEFAULT_OUTPUT_DIR = path.join(repoRoot, 'artifacts/mvp-release-candidate-gate')
const LOG_DIR_NAME = 'logs'
const REPORT_DIR_NAME = 'reports'
const SUMMARY_JSON_NAME = 'mvp-release-candidate-gate-summary.json'
const SUMMARY_MD_NAME = 'mvp-release-candidate-gate-summary.md'
const ARTIFACT_INDEX_JSON_NAME = 'mvp-release-candidate-gate-artifact-index.json'
const MAX_BUFFER_BYTES = 96 * 1024 * 1024

const STAGE_DEFINITIONS = [
  {
    id: 'production_build',
    title: 'Production build',
    command: () => ['pnpm', 'run', 'build'],
    coverage: ['typescript_contracts', 'vite_production_bundle', 'phaser_core_build_profile'],
    docs: ['README.md', 'docs/ver-40-core-default-rollout.md'],
    owner: 'core_runtime',
    kind: 'process',
    artifactPaths: ['dist'],
  },
  {
    id: 'bundle_budget',
    title: 'Bundle budget',
    command: () => ['pnpm', 'run', 'bundle:measure'],
    coverage: ['production_bundle_rebuild', 'total_js_gzip_budget', 'bootstrap_gzip_budget'],
    docs: ['README.md', 'docs/ver-38-bundle-prototypes.md', 'docs/ver-40-core-default-rollout.md'],
    owner: 'bundle_budget',
    kind: 'bundle_budget',
  },
  {
    id: 'core_desktop_smoke',
    title: 'Desktop core smoke',
    command: () => [
      'pnpm',
      'exec',
      'playwright',
      'test',
      '--project=desktop-chromium',
      'tests/smoke/core-loop.spec.ts',
      '--reporter=json',
    ],
    coverage: [
      'launch_loop',
      'plant_harvest_sell',
      'expansion',
      'reload_save',
      'retention_objectives',
      'frame_health',
    ],
    docs: ['README.md', 'docs/ver-42-startup-telemetry-baseline.md'],
    owner: 'core_loop',
    kind: 'playwright',
    testRefs: ['tests/smoke/core-loop.spec.ts'],
  },
  {
    id: 'mobile_touch_smoke',
    title: 'Mobile core and touch smoke',
    command: () => [
      'pnpm',
      'exec',
      'playwright',
      'test',
      '--project=mobile-chromium',
      'tests/smoke/core-loop.spec.ts',
      'tests/smoke/touch-path.spec.ts',
      '--reporter=json',
    ],
    coverage: [
      'mobile_core_loop',
      'real_touch_path',
      'move_plant_harvest_sell',
      'expansion',
      'reload_save',
      'mobile_frame_health',
    ],
    docs: ['README.md', 'docs/ver-42-startup-telemetry-baseline.md'],
    owner: 'mobile_core_loop',
    kind: 'playwright',
    testRefs: ['tests/smoke/core-loop.spec.ts', 'tests/smoke/touch-path.spec.ts'],
  },
  {
    id: 'save_migration_smoke',
    title: 'Save migration smoke',
    command: () => [
      'pnpm',
      'exec',
      'playwright',
      'test',
      '--project=desktop-chromium',
      'tests/smoke/save-migration-matrix.spec.ts',
      '--reporter=json',
    ],
    coverage: ['legacy_save_fixtures', 'retention_defaults', 'resave_compatibility'],
    docs: ['README.md', 'docs/ver-93-save-migration-compatibility-matrix.md'],
    owner: 'save_migration',
    kind: 'playwright',
    testRefs: [
      'tests/smoke/save-migration-matrix.spec.ts',
      'tests/fixtures/save/save-migration-matrix.fixture.json',
    ],
  },
  {
    id: 'retention_release_gate',
    title: 'Retention release gate',
    command: (options) => [
      'pnpm',
      'run',
      'gate:retention:release',
      '--runtime-budgets=tests/fixtures/analytics/retention-release-gate-runtime-budgets.fixture.json',
      `--output-dir=${path.join(options.outputDir, 'retention-release-gate')}`,
    ],
    coverage: [
      'return_objective_balance',
      'retention_soak',
      'mobile_memory_gate',
      'retention_health_snapshot',
      'release_runtime_budget',
    ],
    docs: [
      'docs/ver-91-objective-streak-economy-guardrails.md',
      'docs/ver-96-retention-soak-harness.md',
      'docs/ver-100-mobile-memory-drift-gate.md',
      'docs/ver-101-retention-health-snapshot-gate.md',
      'docs/ver-102-retention-release-gate-orchestrator.md',
      'docs/ver-104-retention-gate-ci-runtime-budget.md',
      'docs/ver-105-retention-gate-replay-pack.md',
    ],
    owner: 'retention_release',
    kind: 'nested_gate',
    nestedSummaryPath: (options) =>
      path.join(options.outputDir, 'retention-release-gate/retention-release-gate-summary.json'),
    nestedMarkdownPath: (options) =>
      path.join(options.outputDir, 'retention-release-gate/retention-release-gate-summary.md'),
    nestedIndexPath: (options) =>
      path.join(options.outputDir, 'retention-release-gate/retention-release-gate-artifact-index.json'),
  },
  {
    id: 'barn_mvp_gate',
    title: 'Barn MVP gate',
    command: (options) => [
      'pnpm',
      'run',
      'gate:barn:mvp',
      `--output-dir=${path.join(options.outputDir, 'barn-mvp-release-gate')}`,
    ],
    coverage: [
      'fresh_barn_handoff',
      'recipe_unlock',
      'mobile_processing_claim_ship',
      'save_reload_persistence',
      'duplicate_market_order_claim_guard',
    ],
    docs: ['docs/ver-114-barn-loop-instrumentation-smoke.md', 'docs/ver-120-barn-mvp-release-gate.md'],
    owner: 'barn_mvp',
    kind: 'nested_gate',
    nestedSummaryPath: (options) =>
      path.join(options.outputDir, 'barn-mvp-release-gate/barn-mvp-release-gate-summary.json'),
    nestedMarkdownPath: (options) =>
      path.join(options.outputDir, 'barn-mvp-release-gate/barn-mvp-release-gate-summary.md'),
    nestedIndexPath: (options) =>
      path.join(options.outputDir, 'barn-mvp-release-gate/barn-mvp-release-gate-artifact-index.json'),
  },
]

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/run-mvp-release-candidate-gate.mjs [options]',
      '',
      'Options:',
      '  --output-dir=<path>   Output directory for summary, logs, and nested gate artifacts.',
      '  --no-fail-fast        Continue later independent stages after a stage fails.',
      '  --help                Show this message.',
      '',
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    failFast: true,
  }

  for (const arg of argv) {
    if (arg === '--') {
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg === '--no-fail-fast') {
      options.failFast = false
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

    throw new Error(`Unknown argument: ${arg}`)
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

function normalizeArtifactPath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return filePath
  }

  if (path.isAbsolute(filePath)) {
    return toRelativeRepoPath(filePath)
  }

  return filePath
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
  if (!fs.existsSync(filePath)) {
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

function parseNestedGateMetrics(summaryPath) {
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
  const branch = runProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD'])

  return {
    commit: commit.exitCode === 0 ? commit.stdout.trim() : null,
    branch: branch.exitCode === 0 ? branch.stdout.trim() : null,
  }
}

function writeBundleBudgetArtifact(options, result) {
  const bundleDir = path.join(options.outputDir, 'bundle-budget')
  ensureDir(bundleDir)

  const reportPath = path.join(bundleDir, 'bundle-budget-report.md')
  fs.writeFileSync(reportPath, result.stdout, 'utf8')

  return toRelativeRepoPath(reportPath)
}

function buildStageResult(definition, options) {
  const command = definition.command(options)
  const env = {}
  const artifactPaths = Array.isArray(definition.artifactPaths)
    ? definition.artifactPaths.map(normalizeArtifactPath)
    : []
  let metrics = {}

  if (definition.kind === 'playwright') {
    const reportsDir = path.join(options.outputDir, REPORT_DIR_NAME)
    ensureDir(reportsDir)

    const reportPath = path.join(reportsDir, `${definition.id}.playwright.json`)
    env.PLAYWRIGHT_JSON_OUTPUT_NAME = reportPath
    artifactPaths.push(toRelativeRepoPath(reportPath))
  }

  const result = runProcess(command[0], command.slice(1), env)
  const logPaths = writeLogs(options.outputDir, definition.id, result)
  artifactPaths.push(toRelativeRepoPath(logPaths.stdoutPath))
  artifactPaths.push(toRelativeRepoPath(logPaths.stderrPath))

  if (definition.kind === 'playwright' && env.PLAYWRIGHT_JSON_OUTPUT_NAME) {
    metrics = parsePlaywrightMetrics(env.PLAYWRIGHT_JSON_OUTPUT_NAME)
  } else if (definition.kind === 'bundle_budget') {
    const reportPath = writeBundleBudgetArtifact(options, result)
    artifactPaths.push(reportPath)
    metrics = {
      reportPath,
    }
  } else if (definition.kind === 'nested_gate') {
    const nestedSummaryPath = definition.nestedSummaryPath(options)
    const nestedMarkdownPath = definition.nestedMarkdownPath(options)
    const nestedIndexPath = definition.nestedIndexPath(options)
    metrics = parseNestedGateMetrics(nestedSummaryPath)
    artifactPaths.push(toRelativeRepoPath(nestedSummaryPath))
    artifactPaths.push(toRelativeRepoPath(nestedMarkdownPath))
    artifactPaths.push(toRelativeRepoPath(nestedIndexPath))
  }

  if (result.errorMessage) {
    metrics.error = result.errorMessage
  }

  return {
    id: definition.id,
    title: definition.title,
    status: result.exitCode === 0 ? 'pass' : 'fail',
    owner: definition.owner,
    coverage: [...definition.coverage],
    command: formatCommand(command),
    commandParts: [...command],
    testRefs: Array.isArray(definition.testRefs) ? [...definition.testRefs] : [],
    docs: [...definition.docs],
    durationMs: result.durationMs,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    exitCode: result.exitCode,
    metrics,
    artifactPaths: [...new Set(artifactPaths)],
    stdoutLogPath: toRelativeRepoPath(logPaths.stdoutPath),
    stderrLogPath: toRelativeRepoPath(logPaths.stderrPath),
  }
}

function buildSkippedStageResult(definition, options, blockedByStageId) {
  const command = definition.command(options)

  return {
    id: definition.id,
    title: definition.title,
    status: 'skipped',
    owner: definition.owner,
    coverage: [...definition.coverage],
    command: formatCommand(command),
    commandParts: [...command],
    testRefs: Array.isArray(definition.testRefs) ? [...definition.testRefs] : [],
    docs: [...definition.docs],
    durationMs: 0,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    metrics: {},
    artifactPaths: [],
    stdoutLogPath: null,
    stderrLogPath: null,
    skipReason: `Skipped after failure in "${blockedByStageId}".`,
  }
}

function buildFailureList(stageResults) {
  return stageResults
    .filter((stage) => stage.status === 'fail')
    .map((stage) => {
      const nestedFailures = Array.isArray(stage.metrics.failures) ? stage.metrics.failures : []
      const nestedArtifactPaths = nestedFailures.flatMap((failure) =>
        [
          failure.stdoutLogPath,
          failure.stderrLogPath,
          ...(Array.isArray(failure.artifactPaths) ? failure.artifactPaths : []),
        ].filter((value) => typeof value === 'string' && value.length > 0),
      )

      return {
        stageId: stage.id,
        stageTitle: stage.title,
        owner: stage.owner,
        command: stage.command,
        exitCode: stage.exitCode,
        ownerDocs: stage.docs,
        artifactPaths: [...new Set([...stage.artifactPaths, ...nestedArtifactPaths])],
        stdoutLogPath: stage.stdoutLogPath,
        stderrLogPath: stage.stderrLogPath,
        firstFailure: nestedFailures[0] ?? null,
        nestedFailures,
      }
    })
}

function buildArtifactIndex(summary) {
  return {
    schemaVersion: 1,
    issueIdentifier: 'VER-121',
    generatedAt: summary.generatedAt,
    summary: {
      overallStatus: summary.summary.overallStatus,
      failedStageCount: summary.summary.failed,
      skippedStageCount: summary.summary.skipped,
    },
    artifacts: {
      summaryJsonPath: summary.jsonArtifactPath,
      summaryMarkdownPath: summary.markdownArtifactPath,
      logsPath: summary.logsPath,
      reportsPath: summary.reportsPath,
    },
    stages: summary.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      status: stage.status,
      owner: stage.owner,
      command: stage.command,
      ownerDocs: stage.docs,
      coverage: stage.coverage,
      stdoutLogPath: stage.stdoutLogPath,
      stderrLogPath: stage.stderrLogPath,
      artifactPaths: stage.artifactPaths,
      skipReason: stage.skipReason ?? null,
    })),
  }
}

function buildSummary(options, stageResults) {
  const generatedAt = new Date().toISOString()
  const passed = stageResults.filter((stage) => stage.status === 'pass').length
  const failed = stageResults.filter((stage) => stage.status === 'fail').length
  const skipped = stageResults.filter((stage) => stage.status === 'skipped').length
  const totalDurationMs = stageResults.reduce((sum, stage) => sum + stage.durationMs, 0)
  const summaryJsonPath = path.join(options.outputDir, SUMMARY_JSON_NAME)
  const summaryMarkdownPath = path.join(options.outputDir, SUMMARY_MD_NAME)
  const artifactIndexPath = path.join(options.outputDir, ARTIFACT_INDEX_JSON_NAME)

  return {
    schemaVersion: 1,
    issueIdentifier: 'VER-121',
    generatedAt,
    gate: {
      command: 'pnpm run gate:mvp:release',
      outputDir: toRelativeRepoPath(options.outputDir),
      failFast: options.failFast,
      git: resolveGitMetadata(),
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    },
    summary: {
      overallStatus: failed === 0 && skipped === 0 ? 'pass' : 'fail',
      stageCount: stageResults.length,
      passed,
      failed,
      skipped,
      totalDurationMs,
    },
    coverage: {
      requiredGates: [
        'production build',
        'bundle budget',
        'desktop core smoke',
        'mobile core/touch smoke',
        'save migration smoke',
        'retention release gate',
        'Barn MVP gate',
      ],
      stageCoverage: Object.fromEntries(stageResults.map((stage) => [stage.id, stage.coverage])),
    },
    failures: buildFailureList(stageResults),
    stages: stageResults,
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

function formatDocList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 'n/a'
  }

  return values.map((value) => `\`${escapeMarkdownCell(value)}\``).join('<br>')
}

function formatFailureDetail(failure) {
  if (failure.firstFailure) {
    const title =
      failure.firstFailure.title ??
      failure.firstFailure.stageTitle ??
      failure.firstFailure.stageId ??
      'nested stage'
    const message =
      failure.firstFailure.message ??
      failure.firstFailure.classificationLabel ??
      failure.firstFailure.failureClassification ??
      'see nested gate artifacts'

    return `${title}: ${message}`
  }

  if (failure.nestedFailures.length > 0) {
    const nested = failure.nestedFailures[0]
    return `${nested.stageTitle ?? nested.stageId ?? 'nested stage'} failed`
  }

  return 'See stage logs and artifacts.'
}

function renderSummaryMarkdown(summary) {
  const lines = [
    '# Tiny Ranch MVP Release-Candidate Gate',
    '',
    `- Generated at: ${summary.generatedAt}`,
    `- Overall status: **${summary.summary.overallStatus.toUpperCase()}**`,
    `- Stages: ${summary.summary.passed} passed, ${summary.summary.failed} failed, ${summary.summary.skipped} skipped`,
    `- Total runtime: ${summary.summary.totalDurationMs} ms`,
    `- Command: \`${summary.gate.command}\``,
    '',
    '## Stage Summary',
    '',
    '| Stage | Status | Duration (ms) | Owner | Command | Owner Docs | Artifacts |',
    '| --- | --- | ---: | --- | --- | --- | --- |',
  ]

  for (const stage of summary.stages) {
    const statusLabel =
      stage.status === 'pass'
        ? 'PASS'
        : stage.status === 'fail'
          ? 'FAIL'
          : `SKIP (${stage.skipReason ?? 'not run'})`

    lines.push(
      `| ${escapeMarkdownCell(stage.title)} | ${escapeMarkdownCell(statusLabel)} | ${stage.durationMs} | ${escapeMarkdownCell(stage.owner)} | \`${escapeMarkdownCell(stage.command)}\` | ${formatDocList(stage.docs)} | ${formatInlineCodeList(stage.artifactPaths)} |`,
    )
  }

  lines.push('', '## Failures', '')

  if (summary.failures.length === 0) {
    lines.push('No failed MVP release-candidate stages.', '')
  } else {
    lines.push('| Stage | Exit | Owner | First Failure | Command | Artifacts | Owner Docs |')
    lines.push('| --- | ---: | --- | --- | --- | --- | --- |')
    for (const failure of summary.failures) {
      lines.push(
        `| ${escapeMarkdownCell(failure.stageTitle)} | ${failure.exitCode} | ${escapeMarkdownCell(failure.owner)} | ${escapeMarkdownCell(formatFailureDetail(failure))} | \`${escapeMarkdownCell(failure.command)}\` | ${formatInlineCodeList(failure.artifactPaths)} | ${formatDocList(failure.ownerDocs)} |`,
      )
    }
    lines.push('')
  }

  lines.push('## Triage Order', '')
  lines.push('1. Start with the first failed row in `Failures`.')
  lines.push('2. Open the listed owner doc, then the first artifact/log path for that stage.')
  lines.push('3. Re-run the exact command in the failed row, or use `--no-fail-fast` for a broader local pass.')
  lines.push('4. Keep the lower-level gate callable independently and rerun `pnpm run gate:mvp:release` before launch signoff.')
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
    `[mvp-release-gate] ${summary.summary.overallStatus.toUpperCase()} (${summary.summary.passed} passed, ${summary.summary.failed} failed, ${summary.summary.skipped} skipped)`,
    `[mvp-release-gate] summary: ${summary.markdownArtifactPath}`,
  ]

  for (const stage of summary.stages) {
    const suffix = stage.status === 'skipped' ? ` (${stage.skipReason})` : ''
    lines.push(`[mvp-release-gate] ${stage.status.toUpperCase()} ${stage.id}${suffix}`)
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

  const stageResults = []
  let blockedByStageId = null

  for (const definition of STAGE_DEFINITIONS) {
    if (blockedByStageId && options.failFast) {
      stageResults.push(buildSkippedStageResult(definition, options, blockedByStageId))
      continue
    }

    process.stdout.write(`[mvp-release-gate] running ${definition.id}: ${definition.title}\n`)
    const stageResult = buildStageResult(definition, options)
    stageResults.push(stageResult)

    if (stageResult.status === 'fail' && !blockedByStageId) {
      blockedByStageId = stageResult.id
    }
  }

  const summary = buildSummary(options, stageResults)
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
    `[mvp-release-gate] failed: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
}
