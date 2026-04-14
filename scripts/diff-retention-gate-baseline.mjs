#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const DEFAULT_OUTPUT_DIR = path.join(repoRoot, 'artifacts/retention-baseline-diff')
const DEFAULT_BASELINE_PATH = path.join(
  repoRoot,
  'tests/fixtures/analytics/retention-gate-baseline.fixture.json',
)
const DEFAULT_SUMMARY_PATH = path.join(
  repoRoot,
  'artifacts/retention-health/retention-health-summary.json',
)
const HEALTH_OUTPUT_DIR_NAME = 'retention-health'
const LOG_DIR_NAME = 'logs'
const SUMMARY_JSON_NAME = 'retention-baseline-diff.json'
const SUMMARY_MD_NAME = 'retention-baseline-diff.md'
const HEALTH_RUN_STDOUT_NAME = 'retention_health_snapshot.stdout.log'
const HEALTH_RUN_STDERR_NAME = 'retention_health_snapshot.stderr.log'
const MAX_BUFFER_BYTES = 64 * 1024 * 1024

const DEFAULT_DRIFT_THRESHOLDS = Object.freeze([
  Object.freeze({
    metric: 'overallStatus',
    label: 'Retention health overall status',
  }),
  Object.freeze({
    metric: 'retentionSoak.minimumObjectiveEnabledClaimRate',
    label: 'Claim completion rate',
    maxAbsoluteDelta: 0.05,
    maxRelativeDeltaPct: 5,
  }),
  Object.freeze({
    metric: 'objectiveBalance.scenarios.daily_claim_streak.streakBonus',
    label: 'Streak continuity (daily claim)',
    maxAbsoluteDelta: 120,
    maxRelativeDeltaPct: 20,
  }),
  Object.freeze({
    metric: 'objectiveBalance.scenarios.lapse_recovery_streak.streakBonus',
    label: 'Streak continuity (lapse recovery)',
    maxAbsoluteDelta: 120,
    maxRelativeDeltaPct: 20,
  }),
  Object.freeze({
    metric: 'objectiveBalance.failingScenarios',
    label: 'Objective balance guardrail failures',
    maxAbsoluteDelta: 0,
  }),
  Object.freeze({
    metric: 'retentionSoak.failingCases',
    label: 'Retention soak guardrail failures',
    maxAbsoluteDelta: 0,
  }),
  Object.freeze({
    metric: 'saveMigration.failedTests',
    label: 'Save migration guardrail failures',
    maxAbsoluteDelta: 0,
  }),
  Object.freeze({
    metric: 'saveMigration.status',
    label: 'Save migration guardrail status',
  }),
  Object.freeze({
    metric: 'memoryGate.failedTests',
    label: 'Memory gate guardrail failures',
    maxAbsoluteDelta: 0,
  }),
  Object.freeze({
    metric: 'memoryGate.status',
    label: 'Memory gate guardrail status',
  }),
])

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/diff-retention-gate-baseline.mjs [options]',
      '',
      'Options:',
      '  --summary=<path>           Use an existing retention-health summary JSON artifact.',
      '  --run-health-report        Generate retention-health summary before diffing (default).',
      '  --no-run-health-report     Skip report generation and read --summary (or default summary path).',
      '  --run-playwright           Include Playwright checks when running report (default).',
      '  --no-run-playwright        Skip Playwright checks when running report.',
      '  --baseline=<path>          Baseline fixture path override.',
      '  --output-dir=<path>        Output directory for diff artifacts.',
      '  --update-baseline          Refresh baseline metrics from current summary before diffing.',
      '  --help                     Show this message.',
      '',
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const options = {
    runHealthReport: true,
    runPlaywright: true,
    summaryPath: null,
    baselinePath: DEFAULT_BASELINE_PATH,
    outputDir: DEFAULT_OUTPUT_DIR,
    updateBaseline: false,
  }

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg === '--run-health-report') {
      options.runHealthReport = true
      continue
    }

    if (arg === '--no-run-health-report') {
      options.runHealthReport = false
      continue
    }

    if (arg === '--run-playwright') {
      options.runPlaywright = true
      continue
    }

    if (arg === '--no-run-playwright') {
      options.runPlaywright = false
      continue
    }

    if (arg === '--update-baseline') {
      options.updateBaseline = true
      continue
    }

    if (arg.startsWith('--summary=')) {
      const rawPath = arg.slice('--summary='.length).trim()
      if (rawPath.length === 0) {
        throw new Error('--summary requires a non-empty path.')
      }

      options.summaryPath = path.resolve(process.cwd(), rawPath)
      options.runHealthReport = false
      continue
    }

    if (arg.startsWith('--baseline=')) {
      const rawPath = arg.slice('--baseline='.length).trim()
      if (rawPath.length === 0) {
        throw new Error('--baseline requires a non-empty path.')
      }

      options.baselinePath = path.resolve(process.cwd(), rawPath)
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

  if (!options.runHealthReport && !options.summaryPath) {
    options.summaryPath = DEFAULT_SUMMARY_PATH
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

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function readJson(filePath, description) {
  const raw = fs.readFileSync(filePath, 'utf8')

  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Could not parse ${description} at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function asFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function getCheck(summary, checkId) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error('Retention summary must be an object.')
  }

  if (!Array.isArray(summary.checks)) {
    throw new Error('Retention summary is missing the "checks" array.')
  }

  const check = summary.checks.find((candidate) => candidate && candidate.id === checkId)
  if (!check) {
    throw new Error(`Retention summary is missing check "${checkId}".`)
  }

  return check
}

function extractScenarioRows(check) {
  if (!check.metrics || typeof check.metrics !== 'object' || Array.isArray(check.metrics)) {
    return []
  }

  return Array.isArray(check.metrics.scenarios) ? check.metrics.scenarios : []
}

function extractCurrentMetrics(summary) {
  const objectiveBalanceCheck = getCheck(summary, 'objective_balance')
  const retentionSoakCheck = getCheck(summary, 'retention_soak')
  const saveMigrationCheck = getCheck(summary, 'save_migration_matrix')
  const memoryGateCheck = getCheck(summary, 'retention_memory_gate')

  const objectiveScenarioMap = {}
  for (const row of extractScenarioRows(objectiveBalanceCheck)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      continue
    }

    const scenarioId = typeof row.scenario === 'string' ? row.scenario.trim() : ''
    if (scenarioId.length === 0) {
      continue
    }

    objectiveScenarioMap[scenarioId] = {
      streakBonus: asFiniteNumber(row.streakBonus),
      status: typeof row.status === 'string' ? row.status : null,
    }
  }

  const objectiveMetrics =
    objectiveBalanceCheck.metrics && typeof objectiveBalanceCheck.metrics === 'object'
      ? objectiveBalanceCheck.metrics
      : {}
  const soakMetrics =
    retentionSoakCheck.metrics && typeof retentionSoakCheck.metrics === 'object'
      ? retentionSoakCheck.metrics
      : {}
  const saveMetrics =
    saveMigrationCheck.metrics && typeof saveMigrationCheck.metrics === 'object'
      ? saveMigrationCheck.metrics
      : {}
  const memoryMetrics =
    memoryGateCheck.metrics && typeof memoryGateCheck.metrics === 'object'
      ? memoryGateCheck.metrics
      : {}

  return {
    overallStatus: typeof summary.summary?.overallStatus === 'string' ? summary.summary.overallStatus : null,
    objectiveBalance: {
      failingScenarios: asFiniteNumber(objectiveMetrics.failingScenarios),
      scenarios: objectiveScenarioMap,
    },
    retentionSoak: {
      failingCases: asFiniteNumber(soakMetrics.failingCases),
      minimumObjectiveEnabledClaimRate: asFiniteNumber(soakMetrics.minimumObjectiveEnabledClaimRate),
      objectiveEnabledCaseCount: asFiniteNumber(soakMetrics.objectiveEnabledCaseCount),
    },
    saveMigration: {
      status: typeof saveMigrationCheck.status === 'string' ? saveMigrationCheck.status : null,
      passedTests: asFiniteNumber(saveMetrics.passed),
      failedTests: asFiniteNumber(saveMetrics.failed),
      totalTests: asFiniteNumber(saveMetrics.total),
    },
    memoryGate: {
      status: typeof memoryGateCheck.status === 'string' ? memoryGateCheck.status : null,
      passedTests: asFiniteNumber(memoryMetrics.passed),
      failedTests: asFiniteNumber(memoryMetrics.failed),
      totalTests: asFiniteNumber(memoryMetrics.total),
    },
  }
}

function getByPath(objectValue, pathExpression) {
  const segments = pathExpression.split('.').filter((segment) => segment.length > 0)
  let cursor = objectValue

  for (const segment of segments) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return undefined
    }

    if (!Object.prototype.hasOwnProperty.call(cursor, segment)) {
      return undefined
    }

    cursor = cursor[segment]
  }

  return cursor
}

function cloneDefaultThresholds() {
  return DEFAULT_DRIFT_THRESHOLDS.map((entry) => ({
    metric: entry.metric,
    label: entry.label,
    maxAbsoluteDelta:
      typeof entry.maxAbsoluteDelta === 'number' && Number.isFinite(entry.maxAbsoluteDelta)
        ? entry.maxAbsoluteDelta
        : undefined,
    maxRelativeDeltaPct:
      typeof entry.maxRelativeDeltaPct === 'number' && Number.isFinite(entry.maxRelativeDeltaPct)
        ? entry.maxRelativeDeltaPct
        : undefined,
  }))
}

function validateThresholds(rawThresholds) {
  if (!Array.isArray(rawThresholds) || rawThresholds.length === 0) {
    throw new Error('Baseline fixture must include a non-empty "driftThresholds" array.')
  }

  const thresholds = []
  for (const [index, threshold] of rawThresholds.entries()) {
    if (!threshold || typeof threshold !== 'object' || Array.isArray(threshold)) {
      throw new Error(`driftThresholds[${index}] must be an object.`)
    }

    const metric = typeof threshold.metric === 'string' ? threshold.metric.trim() : ''
    if (metric.length === 0) {
      throw new Error(`driftThresholds[${index}] must include a non-empty "metric" path.`)
    }

    const label =
      typeof threshold.label === 'string' && threshold.label.trim().length > 0
        ? threshold.label.trim()
        : metric

    const normalized = {
      metric,
      label,
      maxAbsoluteDelta: undefined,
      maxRelativeDeltaPct: undefined,
    }

    if (Object.prototype.hasOwnProperty.call(threshold, 'maxAbsoluteDelta')) {
      const maxAbsoluteDelta = asFiniteNumber(threshold.maxAbsoluteDelta)
      if (maxAbsoluteDelta === null || maxAbsoluteDelta < 0) {
        throw new Error(
          `driftThresholds[${index}].maxAbsoluteDelta must be a finite number greater than or equal to zero.`,
        )
      }

      normalized.maxAbsoluteDelta = maxAbsoluteDelta
    }

    if (Object.prototype.hasOwnProperty.call(threshold, 'maxRelativeDeltaPct')) {
      const maxRelativeDeltaPct = asFiniteNumber(threshold.maxRelativeDeltaPct)
      if (maxRelativeDeltaPct === null || maxRelativeDeltaPct < 0) {
        throw new Error(
          `driftThresholds[${index}].maxRelativeDeltaPct must be a finite number greater than or equal to zero.`,
        )
      }

      normalized.maxRelativeDeltaPct = maxRelativeDeltaPct
    }

    thresholds.push(normalized)
  }

  return thresholds
}

function readBaselineFixture(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    return null
  }

  const fixture = readJson(baselinePath, 'baseline fixture')
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) {
    throw new Error(`Baseline fixture at ${baselinePath} must be an object.`)
  }

  if (!fixture.metrics || typeof fixture.metrics !== 'object' || Array.isArray(fixture.metrics)) {
    throw new Error(`Baseline fixture at ${baselinePath} must include a "metrics" object.`)
  }

  const thresholds = validateThresholds(fixture.driftThresholds)
  return {
    version:
      typeof fixture.version === 'number' && Number.isFinite(fixture.version) ? fixture.version : 1,
    updatedAt: typeof fixture.updatedAt === 'string' ? fixture.updatedAt : null,
    sourceSummaryPath: typeof fixture.sourceSummaryPath === 'string' ? fixture.sourceSummaryPath : null,
    metrics: fixture.metrics,
    driftThresholds: thresholds,
  }
}

function writeBaselineFixture({
  baselinePath,
  existingBaseline,
  summaryPath,
  currentMetrics,
}) {
  const driftThresholds = existingBaseline?.driftThresholds
    ? existingBaseline.driftThresholds
    : cloneDefaultThresholds()

  const fixture = {
    version: 1,
    updatedAt: new Date().toISOString(),
    sourceSummaryPath: toRelativeRepoPath(summaryPath),
    metrics: currentMetrics,
    driftThresholds,
  }

  ensureDirectory(baselinePath)
  fs.writeFileSync(baselinePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  return fixture
}

function isNumericPair(left, right) {
  return typeof left === 'number' && Number.isFinite(left) && typeof right === 'number' && Number.isFinite(right)
}

function isExactEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function evaluateMetricDrift(metric, baselineValue, currentValue, thresholdConfig) {
  const baseResult = {
    metric,
    label: thresholdConfig.label,
    baselineValue,
    currentValue,
    comparisonType: 'exact',
    changed: false,
    breached: false,
    withinThreshold: true,
    threshold: {
      maxAbsoluteDelta:
        typeof thresholdConfig.maxAbsoluteDelta === 'number'
          ? thresholdConfig.maxAbsoluteDelta
          : null,
      maxRelativeDeltaPct:
        typeof thresholdConfig.maxRelativeDeltaPct === 'number'
          ? thresholdConfig.maxRelativeDeltaPct
          : null,
    },
    drift: {
      delta: null,
      absoluteDelta: null,
      relativeDeltaPct: null,
    },
    message: 'No drift.',
  }

  if (typeof baselineValue === 'undefined') {
    return {
      ...baseResult,
      breached: true,
      withinThreshold: false,
      message: 'Baseline metric path is missing.',
    }
  }

  if (typeof currentValue === 'undefined') {
    return {
      ...baseResult,
      breached: true,
      withinThreshold: false,
      message: 'Current metric path is missing.',
    }
  }

  if (!isNumericPair(baselineValue, currentValue)) {
    const changed = !isExactEqual(baselineValue, currentValue)
    return {
      ...baseResult,
      comparisonType: 'exact',
      changed,
      breached: changed,
      withinThreshold: !changed,
      message: changed ? 'Exact-value metric changed from baseline.' : 'Exact-value metric matches baseline.',
    }
  }

  const delta = currentValue - baselineValue
  const absoluteDelta = Math.abs(delta)
  const relativeDeltaPct =
    baselineValue === 0 ? (absoluteDelta === 0 ? 0 : null) : (absoluteDelta / Math.abs(baselineValue)) * 100
  const changed = absoluteDelta > 0

  const hasAbsoluteThreshold =
    typeof thresholdConfig.maxAbsoluteDelta === 'number' && Number.isFinite(thresholdConfig.maxAbsoluteDelta)
  const hasRelativeThreshold =
    typeof thresholdConfig.maxRelativeDeltaPct === 'number' &&
    Number.isFinite(thresholdConfig.maxRelativeDeltaPct)

  const breaches = []
  if (hasAbsoluteThreshold && absoluteDelta > thresholdConfig.maxAbsoluteDelta) {
    breaches.push(
      `|delta|=${absoluteDelta} exceeds maxAbsoluteDelta=${thresholdConfig.maxAbsoluteDelta}.`,
    )
  }

  if (hasRelativeThreshold) {
    if (relativeDeltaPct === null) {
      if (absoluteDelta > 0) {
        breaches.push(
          `relative drift is undefined for baseline=0; cannot satisfy maxRelativeDeltaPct=${thresholdConfig.maxRelativeDeltaPct} without zero drift.`,
        )
      }
    } else if (relativeDeltaPct > thresholdConfig.maxRelativeDeltaPct) {
      breaches.push(
        `|delta|%=${relativeDeltaPct.toFixed(4)} exceeds maxRelativeDeltaPct=${thresholdConfig.maxRelativeDeltaPct}.`,
      )
    }
  }

  let withinThreshold = breaches.length === 0
  if (!hasAbsoluteThreshold && !hasRelativeThreshold) {
    withinThreshold = absoluteDelta === 0
    if (!withinThreshold) {
      breaches.push('No numeric drift thresholds configured; exact match required.')
    }
  }

  return {
    ...baseResult,
    comparisonType: 'numeric',
    changed,
    breached: !withinThreshold,
    withinThreshold,
    drift: {
      delta,
      absoluteDelta,
      relativeDeltaPct: relativeDeltaPct === null ? null : Number(relativeDeltaPct.toFixed(6)),
    },
    message: breaches.length === 0 ? 'Within configured drift thresholds.' : breaches.join(' '),
  }
}

function compareAgainstBaseline({
  baselineMetrics,
  currentMetrics,
  thresholds,
}) {
  const results = thresholds.map((threshold) => {
    const baselineValue = getByPath(baselineMetrics, threshold.metric)
    const currentValue = getByPath(currentMetrics, threshold.metric)
    return evaluateMetricDrift(threshold.metric, baselineValue, currentValue, threshold)
  })

  const summary = {
    totalMetrics: results.length,
    changedMetrics: results.filter((result) => result.changed).length,
    thresholdBreaches: results.filter((result) => result.breached).length,
  }

  return {
    summary,
    results,
  }
}

function formatNumeric(value) {
  if (!Number.isFinite(value)) {
    return String(value)
  }

  if (Number.isInteger(value)) {
    return String(value)
  }

  return Number(value.toFixed(6)).toString()
}

function formatMetricValue(value) {
  if (typeof value === 'undefined') {
    return 'missing'
  }

  if (value === null) {
    return 'null'
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number') {
    return formatNumeric(value)
  }

  return JSON.stringify(value)
}

function formatDrift(result) {
  if (result.comparisonType !== 'numeric') {
    return result.changed ? 'changed' : 'no change'
  }

  const delta = result.drift.delta ?? 0
  const prefix = delta > 0 ? '+' : ''
  const deltaLabel = `${prefix}${formatNumeric(delta)}`

  if (result.drift.relativeDeltaPct === null) {
    return `${deltaLabel} (relative n/a)`
  }

  return `${deltaLabel} (${formatNumeric(result.drift.relativeDeltaPct)}%)`
}

function formatThreshold(result) {
  if (result.comparisonType !== 'numeric') {
    return 'exact match'
  }

  const hasAbsoluteThreshold =
    typeof result.threshold.maxAbsoluteDelta === 'number' &&
    Number.isFinite(result.threshold.maxAbsoluteDelta)
  const hasRelativeThreshold =
    typeof result.threshold.maxRelativeDeltaPct === 'number' &&
    Number.isFinite(result.threshold.maxRelativeDeltaPct)

  if (!hasAbsoluteThreshold && !hasRelativeThreshold) {
    return 'exact match'
  }

  if (hasAbsoluteThreshold && hasRelativeThreshold) {
    return `|delta|<=${formatNumeric(result.threshold.maxAbsoluteDelta)} and <=${formatNumeric(result.threshold.maxRelativeDeltaPct)}%`
  }

  if (hasAbsoluteThreshold) {
    return `|delta|<=${formatNumeric(result.threshold.maxAbsoluteDelta)}`
  }

  return `|delta|<=${formatNumeric(result.threshold.maxRelativeDeltaPct)}%`
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, '\\|')
}

function renderMarkdownSummary(diffSummary) {
  const lines = [
    '# Tiny Ranch Retention Baseline Diff',
    '',
    `- Generated at: ${diffSummary.generatedAt}`,
    `- Overall status: **${diffSummary.summary.overallStatus.toUpperCase()}**`,
    `- Baseline fixture: \`${diffSummary.baselinePath}\``,
    `- Compared summary: \`${diffSummary.summaryPath}\``,
    `- Baseline refreshed this run: ${diffSummary.baselineUpdated ? 'yes' : 'no'}`,
    '',
    '## Diff Summary',
    '',
    `- Total tracked metrics: ${diffSummary.summary.totalMetrics}`,
    `- Changed metrics: ${diffSummary.summary.changedMetrics}`,
    `- Threshold breaches: ${diffSummary.summary.thresholdBreaches}`,
    '',
    '## Metric Diff',
    '',
    '| Metric | Baseline | Current | Drift | Threshold | Status |',
    '| --- | --- | --- | --- | --- | --- |',
  ]

  for (const result of diffSummary.results) {
    lines.push(
      `| ${escapeMarkdownCell(result.label)} | ${escapeMarkdownCell(formatMetricValue(result.baselineValue))} | ${escapeMarkdownCell(formatMetricValue(result.currentValue))} | ${escapeMarkdownCell(formatDrift(result))} | ${escapeMarkdownCell(formatThreshold(result))} | ${result.breached ? 'FAIL' : 'PASS'} |`,
    )
  }

  lines.push('', '## Breach Details', '')

  const breaches = diffSummary.results.filter((result) => result.breached)
  if (breaches.length === 0) {
    lines.push('No threshold breaches detected.', '')
  } else {
    for (const breach of breaches) {
      lines.push(`- ${breach.metric}: ${breach.message}`)
    }
    lines.push('')
  }

  lines.push('## Artifact Paths', '')
  lines.push(`- JSON: \`${diffSummary.jsonArtifactPath}\``)
  lines.push(`- Markdown: \`${diffSummary.markdownArtifactPath}\``)
  lines.push(`- Logs: \`${diffSummary.logsPath}\``)
  lines.push('')

  return `${lines.join('\n')}\n`
}

function runHealthReport(options) {
  const healthOutputDir = path.join(options.outputDir, HEALTH_OUTPUT_DIR_NAME)
  const command = ['scripts/report-retention-health.mjs', `--output-dir=${healthOutputDir}`]
  if (options.runPlaywright) {
    command.push('--run-playwright')
  }

  const result = runProcess('node', command)

  const logsDir = path.join(options.outputDir, LOG_DIR_NAME)
  fs.mkdirSync(logsDir, { recursive: true })

  const stdoutPath = path.join(logsDir, HEALTH_RUN_STDOUT_NAME)
  const stderrPath = path.join(logsDir, HEALTH_RUN_STDERR_NAME)
  fs.writeFileSync(stdoutPath, result.stdout, 'utf8')
  fs.writeFileSync(stderrPath, result.stderr, 'utf8')

  if (result.exitCode !== 0) {
    throw new Error(
      `Retention health report failed with exit code ${result.exitCode}. Inspect ${toRelativeRepoPath(stdoutPath)} and ${toRelativeRepoPath(stderrPath)}.`,
    )
  }

  return {
    summaryPath: path.join(healthOutputDir, 'retention-health-summary.json'),
    command: `node ${command.join(' ')}`,
    durationMs: result.durationMs,
    stdoutLogPath: toRelativeRepoPath(stdoutPath),
    stderrLogPath: toRelativeRepoPath(stderrPath),
  }
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  fs.mkdirSync(options.outputDir, { recursive: true })

  let resolvedSummaryPath = options.summaryPath
  let reportRun = null
  if (options.runHealthReport) {
    reportRun = runHealthReport(options)
    resolvedSummaryPath = reportRun.summaryPath
  }

  if (!resolvedSummaryPath) {
    throw new Error('No summary path resolved. Provide --summary or run with --run-health-report.')
  }

  if (!fs.existsSync(resolvedSummaryPath)) {
    throw new Error(`Retention summary JSON not found at ${resolvedSummaryPath}.`)
  }

  const retentionSummary = readJson(resolvedSummaryPath, 'retention health summary')
  const currentMetrics = extractCurrentMetrics(retentionSummary)

  const existingBaseline = readBaselineFixture(options.baselinePath)
  let baselineFixture = existingBaseline

  if (options.updateBaseline) {
    baselineFixture = writeBaselineFixture({
      baselinePath: options.baselinePath,
      existingBaseline,
      summaryPath: resolvedSummaryPath,
      currentMetrics,
    })
  }

  if (!baselineFixture) {
    throw new Error(
      `Baseline fixture not found at ${options.baselinePath}. Run with --update-baseline to create it.`,
    )
  }

  const comparison = compareAgainstBaseline({
    baselineMetrics: baselineFixture.metrics,
    currentMetrics,
    thresholds: baselineFixture.driftThresholds,
  })

  const summaryJsonPath = path.join(options.outputDir, SUMMARY_JSON_NAME)
  const summaryMarkdownPath = path.join(options.outputDir, SUMMARY_MD_NAME)

  const diffSummary = {
    schemaVersion: 1,
    issueIdentifier: 'VER-103',
    generatedAt: new Date().toISOString(),
    options: {
      runHealthReport: options.runHealthReport,
      runPlaywright: options.runPlaywright,
      outputDir: toRelativeRepoPath(options.outputDir),
    },
    baselineUpdated: options.updateBaseline,
    baselinePath: toRelativeRepoPath(options.baselinePath),
    summaryPath: toRelativeRepoPath(resolvedSummaryPath),
    reportRun,
    summary: {
      overallStatus: comparison.summary.thresholdBreaches > 0 ? 'fail' : 'pass',
      ...comparison.summary,
    },
    results: comparison.results,
    jsonArtifactPath: toRelativeRepoPath(summaryJsonPath),
    markdownArtifactPath: toRelativeRepoPath(summaryMarkdownPath),
    logsPath: toRelativeRepoPath(path.join(options.outputDir, LOG_DIR_NAME)),
  }

  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(diffSummary, null, 2)}\n`, 'utf8')
  fs.writeFileSync(summaryMarkdownPath, renderMarkdownSummary(diffSummary), 'utf8')

  process.stdout.write('[retention-baseline-diff] artifacts generated:\n')
  process.stdout.write(`- ${diffSummary.jsonArtifactPath}\n`)
  process.stdout.write(`- ${diffSummary.markdownArtifactPath}\n`)
  process.stdout.write(`- ${diffSummary.logsPath}\n`)

  if (diffSummary.summary.overallStatus === 'fail') {
    process.stderr.write(
      `[retention-baseline-diff] threshold breaches: ${diffSummary.summary.thresholdBreaches}\n`,
    )
    for (const result of diffSummary.results.filter((entry) => entry.breached)) {
      process.stderr.write(
        `- [${result.metric}] baseline=${formatMetricValue(result.baselineValue)} current=${formatMetricValue(result.currentValue)} (${result.message})\n`,
      )
    }
    process.exit(1)
  }
}

try {
  run()
} catch (error) {
  process.stderr.write(
    `[retention-baseline-diff] failed: ${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exit(1)
}
