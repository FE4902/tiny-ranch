#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const DEFAULT_OUTPUT_DIR = path.join(repoRoot, 'artifacts/retention-release-gate')
const LOG_DIR_NAME = 'logs'
const REPORT_DIR_NAME = 'reports'
const SUMMARY_JSON_NAME = 'retention-release-gate-summary.json'
const SUMMARY_MD_NAME = 'retention-release-gate-summary.md'
const MAX_BUFFER_BYTES = 64 * 1024 * 1024

const STAGE_DEFINITIONS = [
  {
    id: 'balance_check',
    title: 'Return objective balance check',
    command: ['node', 'scripts/check-return-objective-balance.mjs'],
    docs: ['docs/ver-91-objective-streak-economy-guardrails.md'],
    kind: 'balance',
    hardBlocker: true,
  },
  {
    id: 'save_migration_smoke',
    title: 'Save migration matrix smoke',
    command: [
      'npx',
      'playwright',
      'test',
      '--project=desktop-chromium',
      'tests/smoke/save-migration-matrix.spec.ts',
      '--reporter=json',
    ],
    docs: ['docs/ver-93-save-migration-compatibility-matrix.md'],
    kind: 'playwright',
    hardBlocker: true,
  },
  {
    id: 'retention_soak',
    title: 'Retention soak checks',
    command: ['node', 'scripts/check-retention-soak.mjs'],
    docs: ['docs/ver-96-retention-soak-harness.md'],
    kind: 'soak',
    hardBlocker: true,
  },
  {
    id: 'memory_gate',
    title: 'Mobile retention memory gate',
    command: [
      'npx',
      'playwright',
      'test',
      '--project=mobile-chromium',
      'tests/smoke/retention-memory-gate.spec.ts',
      '--reporter=json',
    ],
    docs: ['docs/ver-100-mobile-memory-drift-gate.md'],
    kind: 'playwright',
    hardBlocker: true,
  },
  {
    id: 'retention_health_snapshot',
    title: 'Retention health snapshot',
    command: ['node', 'scripts/report-retention-health.mjs', '--run-playwright'],
    docs: ['docs/ver-101-retention-health-snapshot-gate.md'],
    kind: 'health_snapshot',
    hardBlocker: true,
  },
]

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/run-retention-release-gate.mjs [options]',
      '',
      'Options:',
      '  --output-dir=<path>     Output directory for summary + stage logs.',
      '  --no-fail-fast          Continue non-blocked stages after a hard-blocker fails.',
      '  --help                  Show this message.',
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
  const startedAt = Date.now()
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
    maxBuffer: MAX_BUFFER_BYTES,
  })
  const durationMs = Date.now() - startedAt

  return {
    exitCode: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs,
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

function writeLogs(outputDir, stageId, result) {
  const logsDir = path.join(outputDir, LOG_DIR_NAME)
  fs.mkdirSync(logsDir, { recursive: true })

  const stdoutPath = path.join(logsDir, `${stageId}.stdout.log`)
  const stderrPath = path.join(logsDir, `${stageId}.stderr.log`)

  fs.writeFileSync(stdoutPath, result.stdout, 'utf8')
  fs.writeFileSync(stderrPath, result.stderr, 'utf8')

  return {
    stdoutPath,
    stderrPath,
  }
}

function parseBalanceMetrics(stdout) {
  const rowPattern =
    /^\| ([^|]+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| ([0-9.]+)% \| ([+\-]?[0-9.]+)% \| ([+\-]?[0-9.]+)% \| (PASS|FAIL) \|$/
  const rows = []

  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(rowPattern)
    if (!match) {
      continue
    }

    rows.push({
      scenarioId: match[1].trim(),
      status: match[10],
    })
  }

  return {
    scenarioCount: rows.length,
    failingScenarios: rows.filter((row) => row.status === 'FAIL').length,
  }
}

function parseSoakMetrics(stdout) {
  const rowPattern =
    /^\| ([^|]+) \| obj:(\d),streak:(\d),kill:(\d) \| obj:(\d),streak:(\d),kill:(\d) \| (\d+) \| (\d+) \| (\d+) \| (-?\d+) \| ([a-f0-9]{12}) \| (PASS|FAIL) \|$/
  const rows = []

  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(rowPattern)
    if (!match) {
      continue
    }

    rows.push({
      status: match[13],
      objectiveEnabled: match[5] === '1',
      sessions: Number.parseInt(match[8], 10),
      claims: Number.parseInt(match[9], 10),
    })
  }

  const objectiveEnabledRows = rows.filter((row) => row.objectiveEnabled)
  const minimumObjectiveEnabledClaimRate =
    objectiveEnabledRows.length === 0
      ? null
      : Math.min(
          ...objectiveEnabledRows.map((row) => (row.sessions > 0 ? row.claims / row.sessions : 0)),
        )

  return {
    caseCount: rows.length,
    failingCases: rows.filter((row) => row.status === 'FAIL').length,
    objectiveEnabledCaseCount: objectiveEnabledRows.length,
    minimumObjectiveEnabledClaimRate:
      minimumObjectiveEnabledClaimRate === null
        ? null
        : Number(minimumObjectiveEnabledClaimRate.toFixed(6)),
  }
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (_error) {
    return null
  }
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
      reportPath,
    }
  }

  const passed = Number.parseInt(String(stats.expected ?? 0), 10)
  const failed = Number.parseInt(String(stats.unexpected ?? 0), 10) + Number.parseInt(String(stats.flaky ?? 0), 10)
  const skipped = Number.parseInt(String(stats.skipped ?? 0), 10)

  return {
    total: Math.max(0, passed + failed + skipped),
    passed,
    failed,
    skipped,
    durationMs: Number.parseInt(String(stats.duration ?? 0), 10),
    reportPath,
  }
}

function parseHealthSnapshotMetrics(summaryJsonPath) {
  const parsed = readJsonFile(summaryJsonPath)
  if (!parsed || typeof parsed !== 'object') {
    return {
      overallStatus: null,
      failedChecks: null,
      totalChecks: null,
      summaryPath: summaryJsonPath,
    }
  }

  const summary = parsed.summary && typeof parsed.summary === 'object' ? parsed.summary : null
  if (!summary) {
    return {
      overallStatus: null,
      failedChecks: null,
      totalChecks: null,
      summaryPath: summaryJsonPath,
    }
  }

  return {
    overallStatus: typeof summary.overallStatus === 'string' ? summary.overallStatus : null,
    failedChecks:
      typeof summary.failed === 'number' && Number.isFinite(summary.failed) ? summary.failed : null,
    totalChecks:
      typeof summary.total === 'number' && Number.isFinite(summary.total) ? summary.total : null,
    summaryPath: summaryJsonPath,
  }
}

function formatCommand(command) {
  return command.join(' ')
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
  fs.mkdirSync(reportsDir, { recursive: true })

  const command = [...definition.command]
  const env = {}
  const artifacts = []
  let reportPath = null
  let healthSummaryPath = null

  if (definition.kind === 'playwright') {
    reportPath = path.join(reportsDir, `${definition.id}.playwright.json`)
    env.PLAYWRIGHT_JSON_OUTPUT_NAME = reportPath
    artifacts.push(toRelativeRepoPath(reportPath))
  }

  if (definition.kind === 'health_snapshot') {
    const healthOutputDir = path.join(options.outputDir, 'retention-health')
    command.push(`--output-dir=${healthOutputDir}`)
    healthSummaryPath = path.join(healthOutputDir, 'retention-health-summary.json')
    artifacts.push(toRelativeRepoPath(path.join(healthOutputDir, 'retention-health-summary.json')))
    artifacts.push(toRelativeRepoPath(path.join(healthOutputDir, 'retention-health-summary.md')))
    artifacts.push(toRelativeRepoPath(path.join(healthOutputDir, 'logs')))
  }

  const rawResult = runProcess(command[0], command.slice(1), env)
  const logPaths = writeLogs(options.outputDir, definition.id, rawResult)

  let metrics = {}
  if (definition.kind === 'balance') {
    metrics = parseBalanceMetrics(rawResult.stdout)
  } else if (definition.kind === 'soak') {
    metrics = parseSoakMetrics(rawResult.stdout)
  } else if (definition.kind === 'playwright' && reportPath) {
    metrics = parsePlaywrightMetrics(reportPath)
    metrics.reportPath = toRelativeRepoPath(reportPath)
  } else if (definition.kind === 'health_snapshot' && healthSummaryPath) {
    metrics = parseHealthSnapshotMetrics(healthSummaryPath)
    metrics.summaryPath = toRelativeRepoPath(healthSummaryPath)
  }

  if (rawResult.errorMessage) {
    metrics.error = rawResult.errorMessage
  }

  return {
    id: definition.id,
    title: definition.title,
    status: rawResult.exitCode === 0 ? 'pass' : 'fail',
    hardBlocker: definition.hardBlocker,
    command: formatCommand(command),
    docs: definition.docs,
    durationMs: rawResult.durationMs,
    exitCode: rawResult.exitCode,
    metrics,
    artifactPaths: artifacts,
    stdoutLogPath: toRelativeRepoPath(logPaths.stdoutPath),
    stderrLogPath: toRelativeRepoPath(logPaths.stderrPath),
  }
}

function buildSkippedStageResult(definition, blockedByStageId) {
  return {
    id: definition.id,
    title: definition.title,
    status: 'skipped',
    hardBlocker: definition.hardBlocker,
    command: formatCommand(definition.command),
    docs: definition.docs,
    durationMs: 0,
    exitCode: null,
    metrics: {},
    artifactPaths: [],
    stdoutLogPath: null,
    stderrLogPath: null,
    skipReason: `Skipped after hard blocker failure in "${blockedByStageId}".`,
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
      stdoutLogPath: stage.stdoutLogPath,
      stderrLogPath: stage.stderrLogPath,
    }))
}

function buildMetricSummary(stage) {
  if (stage.status === 'skipped') {
    return stage.skipReason ?? 'skipped'
  }

  if (stage.id === 'balance_check') {
    return `${stage.metrics.scenarioCount ?? 0} scenarios, ${stage.metrics.failingScenarios ?? 0} failing`
  }

  if (stage.id === 'save_migration_smoke' || stage.id === 'memory_gate') {
    return `${stage.metrics.passed ?? 0}/${stage.metrics.total ?? 0} tests passed`
  }

  if (stage.id === 'retention_soak') {
    const claimRate = stage.metrics.minimumObjectiveEnabledClaimRate
    const claimRateLabel =
      Number.isFinite(claimRate) && claimRate !== null ? `${(claimRate * 100).toFixed(1)}%` : 'n/a'
    return `${stage.metrics.caseCount ?? 0} cases, min claim rate ${claimRateLabel}`
  }

  if (stage.id === 'retention_health_snapshot') {
    return `${stage.metrics.failedChecks ?? 0}/${stage.metrics.totalChecks ?? 0} failed checks`
  }

  return 'n/a'
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, '\\|')
}

function renderMarkdownSummary(summary) {
  const lines = [
    '# Tiny Ranch Retention Release Gate',
    '',
    `- Generated at: ${summary.generatedAt}`,
    `- Overall status: **${summary.summary.overallStatus.toUpperCase()}**`,
    `- Fail-fast mode: ${summary.options.failFast ? 'enabled' : 'disabled'}`,
    '',
    '## Stage Summary',
    '',
    '| Stage | Status | Duration (ms) | Key metrics | Command |',
    '| --- | --- | ---: | --- | --- |',
  ]

  for (const stage of summary.stages) {
    const statusLabel =
      stage.status === 'pass' ? 'PASS' : stage.status === 'fail' ? 'FAIL' : `SKIP (${stage.skipReason ?? ''})`
    lines.push(
      `| ${escapeMarkdownCell(stage.title)} | ${escapeMarkdownCell(statusLabel)} | ${stage.durationMs} | ${escapeMarkdownCell(buildMetricSummary(stage))} | \`${escapeMarkdownCell(stage.command)}\` |`,
    )
  }

  lines.push('', '## Failures', '')
  if (summary.failures.length === 0) {
    lines.push('No blocking failures detected.', '')
  } else {
    lines.push('| Stage | Exit code | Stdout log | Stderr log |')
    lines.push('| --- | ---: | --- | --- |')
    for (const failure of summary.failures) {
      lines.push(
        `| ${escapeMarkdownCell(failure.stageId)} | ${failure.exitCode} | \`${escapeMarkdownCell(failure.stdoutLogPath)}\` | \`${escapeMarkdownCell(failure.stderrLogPath)}\` |`,
      )
    }
    lines.push('')
  }

  lines.push('## Artifact Paths', '')
  lines.push(`- JSON: \`${summary.jsonArtifactPath}\``)
  lines.push(`- Markdown: \`${summary.markdownArtifactPath}\``)
  lines.push(`- Logs: \`${summary.logsPath}\``)
  lines.push(`- Reports: \`${summary.reportsPath}\``)
  lines.push('')

  return `${lines.join('\n')}\n`
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  fs.mkdirSync(options.outputDir, { recursive: true })

  const stageResults = []
  let blockedByStageId = null

  for (const definition of STAGE_DEFINITIONS) {
    if (blockedByStageId) {
      stageResults.push(buildSkippedStageResult(definition, blockedByStageId))
      continue
    }

    const result = buildStageResult(definition, options)
    stageResults.push(result)

    if (options.failFast && result.status === 'fail' && definition.hardBlocker) {
      blockedByStageId = definition.id
    }
  }

  const summaryCounts = {
    total: stageResults.length,
    passed: stageResults.filter((stage) => stage.status === 'pass').length,
    failed: stageResults.filter((stage) => stage.status === 'fail').length,
    skipped: stageResults.filter((stage) => stage.status === 'skipped').length,
  }

  const failures = buildFailureList(stageResults)
  const summaryJsonPath = path.join(options.outputDir, SUMMARY_JSON_NAME)
  const summaryMarkdownPath = path.join(options.outputDir, SUMMARY_MD_NAME)

  const summary = {
    schemaVersion: 1,
    issueIdentifier: 'VER-102',
    generatedAt: new Date().toISOString(),
    options: {
      outputDir: toRelativeRepoPath(options.outputDir),
      failFast: options.failFast,
    },
    git: resolveGitMetadata(),
    summary: {
      overallStatus: summaryCounts.failed > 0 ? 'fail' : 'pass',
      ...summaryCounts,
    },
    blockedByStageId,
    stages: stageResults,
    failures,
    jsonArtifactPath: toRelativeRepoPath(summaryJsonPath),
    markdownArtifactPath: toRelativeRepoPath(summaryMarkdownPath),
    logsPath: toRelativeRepoPath(path.join(options.outputDir, LOG_DIR_NAME)),
    reportsPath: toRelativeRepoPath(path.join(options.outputDir, REPORT_DIR_NAME)),
  }

  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  fs.writeFileSync(summaryMarkdownPath, renderMarkdownSummary(summary), 'utf8')

  process.stdout.write('[retention-release-gate] artifacts generated:\n')
  process.stdout.write(`- ${summary.jsonArtifactPath}\n`)
  process.stdout.write(`- ${summary.markdownArtifactPath}\n`)
  process.stdout.write(`- ${summary.logsPath}\n`)
  process.stdout.write(`- ${summary.reportsPath}\n`)

  if (summary.summary.overallStatus === 'fail') {
    const firstFailure = failures[0]
    process.stderr.write(
      `[retention-release-gate] blocking stage failed: ${firstFailure ? firstFailure.stageId : 'unknown'}\n`,
    )
    process.exit(1)
  }
}

try {
  run()
} catch (error) {
  process.stderr.write(
    `[retention-release-gate] failed: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exit(1)
}
