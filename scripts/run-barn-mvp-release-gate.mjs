#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const DEFAULT_OUTPUT_DIR = path.join(repoRoot, 'artifacts/barn-mvp-release-gate')
const LOG_DIR_NAME = 'logs'
const REPORT_DIR_NAME = 'reports'
const SUMMARY_JSON_NAME = 'barn-mvp-release-gate-summary.json'
const SUMMARY_MD_NAME = 'barn-mvp-release-gate-summary.md'
const ARTIFACT_INDEX_JSON_NAME = 'barn-mvp-release-gate-artifact-index.json'
const MAX_BUFFER_BYTES = 64 * 1024 * 1024

const STAGE_DEFINITIONS = [
  {
    id: 'fresh_handoff',
    title: 'Fresh Barn handoff',
    command: [
      'npx',
      'playwright',
      'test',
      '--project=desktop-chromium',
      'tests/smoke/barn-processing.spec.ts',
      '--grep',
      'first-run Barn handoff surfaces a reachable Cheese Press start and persists completion',
      '--reporter=json',
    ],
    coverage: [
      'fresh_session_ftue',
      'early_session_handoff',
      'cheese_press_start',
      'handoff_completion_persistence',
    ],
    testRefs: ['tests/smoke/barn-processing.spec.ts'],
    docs: ['docs/ver-120-barn-mvp-release-gate.md'],
  },
  {
    id: 'recipe_unlock',
    title: 'Mobile recipe unlock',
    command: [
      'npx',
      'playwright',
      'test',
      '--project=mobile-chromium',
      'tests/smoke/barn-ui.spec.ts',
      '--grep',
      'mobile Barn locked recipe feedback unlocks through expansion progression',
      '--reporter=json',
    ],
    coverage: ['locked_recipe_feedback', 'expansion_unlock', 'touch_start_after_unlock'],
    testRefs: ['tests/smoke/barn-ui.spec.ts'],
    docs: ['docs/ver-118-barn-mobile-qa.md', 'docs/ver-120-barn-mvp-release-gate.md'],
  },
  {
    id: 'touch_processing_order',
    title: 'Mobile processing, claim, order ship',
    command: [
      'npx',
      'playwright',
      'test',
      '--project=mobile-chromium',
      'tests/smoke/barn-ui.spec.ts',
      '--grep',
      'mobile Barn scene touch flow emits lifecycle telemetry, preserves economy deltas, and persists claim state across reload',
      '--reporter=json',
    ],
    coverage: [
      'touch_path_viability',
      'processing_queue',
      'save_reload_ready_state',
      'claim_output',
      'market_order_fulfillment',
      'post_ship_persistence',
      'barn_lifecycle_telemetry',
    ],
    testRefs: ['tests/smoke/barn-ui.spec.ts'],
    docs: ['docs/ver-114-barn-loop-instrumentation-smoke.md', 'docs/ver-120-barn-mvp-release-gate.md'],
  },
  {
    id: 'market_order_claim_guard',
    title: 'Market order reload claim guard',
    command: [
      'npx',
      'playwright',
      'test',
      '--project=desktop-chromium',
      'tests/smoke/barn-processing.spec.ts',
      '--grep',
      'barn market order pays a deterministic premium and cannot be claimed again after reload',
      '--reporter=json',
    ],
    coverage: ['market_order_premium', 'fulfilled_order_reload_state', 'duplicate_claim_guard'],
    testRefs: ['tests/smoke/barn-processing.spec.ts', 'src/game/config/barnMarketOrders.shared.js'],
    docs: ['docs/ver-120-barn-mvp-release-gate.md'],
  },
]

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/run-barn-mvp-release-gate.mjs [options]',
      '',
      'Options:',
      '  --output-dir=<path>   Output directory for summary + stage logs.',
      '  --no-fail-fast        Continue later stages after a stage fails.',
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
  return path.relative(repoRoot, filePath)
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true })
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
      reportPath,
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
      reportPath,
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
    reportPath,
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

function buildStageResult(definition, options) {
  const reportsDir = path.join(options.outputDir, REPORT_DIR_NAME)
  ensureDir(reportsDir)

  const reportPath = path.join(reportsDir, `${definition.id}.playwright.json`)
  const result = runProcess(definition.command[0], definition.command.slice(1), {
    PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
  })
  const logPaths = writeLogs(options.outputDir, definition.id, result)
  const metrics = parsePlaywrightMetrics(reportPath)

  if (result.errorMessage) {
    metrics.error = result.errorMessage
  }

  return {
    id: definition.id,
    title: definition.title,
    status: result.exitCode === 0 ? 'pass' : 'fail',
    coverage: [...definition.coverage],
    command: formatCommand(definition.command),
    commandParts: [...definition.command],
    testRefs: [...definition.testRefs],
    docs: [...definition.docs],
    durationMs: result.durationMs,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    exitCode: result.exitCode,
    metrics: {
      ...metrics,
      reportPath: toRelativeRepoPath(reportPath),
    },
    artifactPaths: [toRelativeRepoPath(reportPath)],
    stdoutLogPath: toRelativeRepoPath(logPaths.stdoutPath),
    stderrLogPath: toRelativeRepoPath(logPaths.stderrPath),
  }
}

function buildSkippedStageResult(definition, blockedByStageId) {
  return {
    id: definition.id,
    title: definition.title,
    status: 'skipped',
    coverage: [...definition.coverage],
    command: formatCommand(definition.command),
    commandParts: [...definition.command],
    testRefs: [...definition.testRefs],
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
    .map((stage) => ({
      stageId: stage.id,
      stageTitle: stage.title,
      command: stage.command,
      exitCode: stage.exitCode,
      failures: Array.isArray(stage.metrics.failures) ? stage.metrics.failures : [],
      stdoutLogPath: stage.stdoutLogPath,
      stderrLogPath: stage.stderrLogPath,
      reportPath: stage.metrics.reportPath,
    }))
}

function buildArtifactIndex(summary) {
  return {
    schemaVersion: 1,
    issueIdentifier: 'VER-120',
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
      coverage: stage.coverage,
      stdoutLogPath: stage.stdoutLogPath,
      stderrLogPath: stage.stderrLogPath,
      reportPath: stage.metrics.reportPath ?? null,
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
    issueIdentifier: 'VER-120',
    generatedAt,
    gate: {
      command: 'npm run gate:barn:mvp',
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
      requiredMilestones: [
        'fresh/early-session handoff',
        'recipe unlock',
        'processing',
        'claim',
        'market order fulfillment',
        'save/reload persistence',
        'touch-path viability',
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

function formatStageArtifactList(stage) {
  if (!Array.isArray(stage.artifactPaths) || stage.artifactPaths.length === 0) {
    return 'n/a'
  }
  return stage.artifactPaths.map((artifactPath) => `\`${escapeMarkdownCell(artifactPath)}\``).join('<br>')
}

function renderSummaryMarkdown(summary) {
  const lines = [
    '# Tiny Ranch Barn MVP Release Gate',
    '',
    `- Generated at: ${summary.generatedAt}`,
    `- Overall status: **${summary.summary.overallStatus.toUpperCase()}**`,
    `- Stages: ${summary.summary.passed} passed, ${summary.summary.failed} failed, ${summary.summary.skipped} skipped`,
    `- Total runtime: ${summary.summary.totalDurationMs} ms`,
    `- Command: \`${summary.gate.command}\``,
    '',
    '## Stage Summary',
    '',
    '| Stage | Status | Duration (ms) | Tests | Coverage | Logs | Artifacts |',
    '| --- | --- | ---: | ---: | --- | --- | --- |',
  ]

  for (const stage of summary.stages) {
    const statusLabel =
      stage.status === 'pass'
        ? 'PASS'
        : stage.status === 'fail'
          ? 'FAIL'
          : `SKIP (${stage.skipReason ?? 'not run'})`
    const testsLabel =
      typeof stage.metrics.passed === 'number' && typeof stage.metrics.total === 'number'
        ? `${stage.metrics.passed}/${stage.metrics.total}`
        : 'n/a'
    const logLabel =
      stage.stdoutLogPath && stage.stderrLogPath
        ? `\`${escapeMarkdownCell(stage.stdoutLogPath)}\`<br>\`${escapeMarkdownCell(stage.stderrLogPath)}\``
        : 'n/a'

    lines.push(
      `| ${escapeMarkdownCell(stage.title)} | ${escapeMarkdownCell(statusLabel)} | ${stage.durationMs} | ${testsLabel} | ${escapeMarkdownCell(stage.coverage.join(', '))} | ${logLabel} | ${formatStageArtifactList(stage)} |`,
    )
  }

  lines.push('', '## Failures', '')

  if (summary.failures.length === 0) {
    lines.push('No failed Barn gate stages.', '')
  } else {
    lines.push('| Stage | Exit | First failure | Report | Stdout | Stderr |')
    lines.push('| --- | ---: | --- | --- | --- | --- |')
    for (const failure of summary.failures) {
      const firstFailure = failure.failures[0]
      const failureMessage = firstFailure
        ? `${firstFailure.title}: ${firstFailure.message}`
        : 'No Playwright failure detail captured.'
      lines.push(
        `| ${escapeMarkdownCell(failure.stageTitle)} | ${failure.exitCode} | ${escapeMarkdownCell(failureMessage)} | \`${escapeMarkdownCell(failure.reportPath)}\` | \`${escapeMarkdownCell(failure.stdoutLogPath)}\` | \`${escapeMarkdownCell(failure.stderrLogPath)}\` |`,
      )
    }
    lines.push('')
  }

  lines.push('## Triage Order', '')
  lines.push('1. Open the first failed stage row in this summary.')
  lines.push('2. Read the matching Playwright JSON report, then stdout/stderr logs.')
  lines.push('3. Re-run the exact stage command shown in the JSON summary, or re-run the full gate.')
  lines.push('4. Fix the owning Barn subsystem and re-run `npm run gate:barn:mvp` before closing the lane.')
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
    `[barn-mvp-gate] ${summary.summary.overallStatus.toUpperCase()} (${summary.summary.passed} passed, ${summary.summary.failed} failed, ${summary.summary.skipped} skipped)`,
    `[barn-mvp-gate] summary: ${summary.markdownArtifactPath}`,
  ]

  for (const stage of summary.stages) {
    const suffix = stage.status === 'skipped' ? ` (${stage.skipReason})` : ''
    lines.push(`[barn-mvp-gate] ${stage.status.toUpperCase()} ${stage.id}${suffix}`)
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
      stageResults.push(buildSkippedStageResult(definition, blockedByStageId))
      continue
    }

    process.stdout.write(`[barn-mvp-gate] running ${definition.id}: ${definition.title}\n`)
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
  process.stderr.write(`[barn-mvp-gate] failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
