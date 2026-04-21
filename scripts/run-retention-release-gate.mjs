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
const DEFAULT_RUNTIME_BUDGETS_PATH = path.join(
  repoRoot,
  'tests/fixtures/analytics/retention-release-gate-runtime-budgets.fixture.json',
)
const LOG_DIR_NAME = 'logs'
const REPORT_DIR_NAME = 'reports'
const REPLAY_PACK_DIR_NAME = 'replay-pack'
const SUMMARY_JSON_NAME = 'retention-release-gate-summary.json'
const SUMMARY_MD_NAME = 'retention-release-gate-summary.md'
const TIMING_JSON_NAME = 'retention-release-gate-runtime-timing.json'
const TIMING_MD_NAME = 'retention-release-gate-runtime-timing.md'
const ARTIFACT_INDEX_JSON_NAME = 'retention-release-gate-artifact-index.json'
const REPLAY_PACK_JSON_NAME = 'retention-release-gate-replay-pack.json'
const REPLAY_PACK_MD_NAME = 'retention-release-gate-replay-pack.md'
const MAX_BUFFER_BYTES = 64 * 1024 * 1024
const DEFAULT_RERUN_ATTEMPTS = 1
const REPLAY_CONTEXT_ENV_KEYS = [
  'CI',
  'GITHUB_ACTIONS',
  'GITHUB_RUN_ID',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_SHA',
  'GITHUB_REF',
  'GITHUB_REF_NAME',
  'GITHUB_HEAD_REF',
  'GITHUB_BASE_REF',
  'GITHUB_WORKFLOW',
  'GITHUB_WORKFLOW_REF',
  'GITHUB_JOB',
  'RUNNER_OS',
  'RUNNER_ARCH',
  'NODE_ENV',
  'PLAYWRIGHT_BROWSERS_PATH',
  'npm_config_user_agent',
]

const STAGE_DEFINITIONS = [
  {
    id: 'balance_check',
    title: 'Return objective balance check',
    command: ['node', 'scripts/check-return-objective-balance.mjs'],
    docs: ['docs/ver-91-objective-streak-economy-guardrails.md'],
    fixtureRefs: ['src/game/config/returnObjectiveEconomyTuning.shared.js'],
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
    fixtureRefs: [
      'tests/smoke/save-migration-matrix.spec.ts',
      'tests/fixtures/save/save-migration-matrix.fixture.json',
    ],
    kind: 'playwright',
    hardBlocker: true,
  },
  {
    id: 'retention_soak',
    title: 'Retention soak checks',
    command: ['node', 'scripts/check-retention-soak.mjs'],
    docs: ['docs/ver-96-retention-soak-harness.md'],
    fixtureRefs: [
      'src/game/config/returnObjectiveEconomyTuning.shared.js',
      'tests/fixtures/save/retention-soak-baseline.fixture.json',
    ],
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
    fixtureRefs: [
      'tests/smoke/retention-memory-gate.spec.ts',
      'tests/fixtures/save/retention-memory-gate-thresholds.fixture.json',
    ],
    kind: 'playwright',
    hardBlocker: true,
  },
  {
    id: 'retention_health_snapshot',
    title: 'Retention health snapshot',
    command: ['node', 'scripts/report-retention-health.mjs', '--run-playwright'],
    docs: ['docs/ver-101-retention-health-snapshot-gate.md'],
    fixtureRefs: ['tests/fixtures/analytics/retention-health-thresholds.fixture.json'],
    kind: 'health_snapshot',
    hardBlocker: true,
  },
]

const STAGE_ID_SET = new Set(STAGE_DEFINITIONS.map((definition) => definition.id))

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/run-retention-release-gate.mjs [options]',
      '',
      'Options:',
      '  --output-dir=<path>         Output directory for summary + stage logs.',
      '  --runtime-budgets=<path>    Runtime budget fixture path override.',
      `  --rerun-attempts=<count>    Failed-stage rerun attempts for flake diagnostics (default: ${DEFAULT_RERUN_ATTEMPTS}).`,
      '  --no-fail-fast              Continue non-blocked stages after a hard-blocker fails.',
      '  --help                      Show this message.',
      '',
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    runtimeBudgetsPath: DEFAULT_RUNTIME_BUDGETS_PATH,
    rerunAttempts: DEFAULT_RERUN_ATTEMPTS,
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

    if (arg.startsWith('--runtime-budgets=')) {
      const rawPath = arg.slice('--runtime-budgets='.length).trim()
      if (rawPath.length === 0) {
        throw new Error('--runtime-budgets requires a non-empty path.')
      }

      options.runtimeBudgetsPath = path.resolve(process.cwd(), rawPath)
      continue
    }

    if (arg.startsWith('--rerun-attempts=')) {
      const rawCount = arg.slice('--rerun-attempts='.length).trim()
      if (rawCount.length === 0) {
        throw new Error('--rerun-attempts requires a positive integer.')
      }
      options.rerunAttempts = parsePositiveInteger(rawCount, 'rerun-attempts')
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function readJson(filePath, description) {
  const raw = fs.readFileSync(filePath, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Could not parse ${description} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function parsePositiveInteger(raw, fieldName) {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`)
  }
  return value
}

function parsePositiveNumber(raw, fieldName) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive number.`)
  }

  return Math.round(value)
}

function readRuntimeBudgets(runtimeBudgetsPath) {
  if (!fs.existsSync(runtimeBudgetsPath)) {
    throw new Error(`Runtime budget fixture not found at ${runtimeBudgetsPath}.`)
  }

  const parsed = readJson(runtimeBudgetsPath, 'runtime budget fixture')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Runtime budget fixture at ${runtimeBudgetsPath} must be an object.`)
  }

  const budgets = parsed.budgets
  if (!budgets || typeof budgets !== 'object' || Array.isArray(budgets)) {
    throw new Error(`Runtime budget fixture at ${runtimeBudgetsPath} must include a "budgets" object.`)
  }

  const totalDurationMsCeiling = parsePositiveNumber(
    budgets.totalDurationMsCeiling,
    'budgets.totalDurationMsCeiling',
  )

  const stageDurationMsCeilings = {}
  if (Object.prototype.hasOwnProperty.call(budgets, 'stageDurationMsCeilings')) {
    if (
      !budgets.stageDurationMsCeilings ||
      typeof budgets.stageDurationMsCeilings !== 'object' ||
      Array.isArray(budgets.stageDurationMsCeilings)
    ) {
      throw new Error(
        `Runtime budget fixture at ${runtimeBudgetsPath} has invalid "budgets.stageDurationMsCeilings".`,
      )
    }

    for (const [stageId, rawCeiling] of Object.entries(budgets.stageDurationMsCeilings)) {
      if (!STAGE_ID_SET.has(stageId)) {
        throw new Error(
          `Runtime budget fixture at ${runtimeBudgetsPath} has unknown stage id "${stageId}" in stageDurationMsCeilings.`,
        )
      }

      stageDurationMsCeilings[stageId] = parsePositiveNumber(
        rawCeiling,
        `budgets.stageDurationMsCeilings.${stageId}`,
      )
    }
  }

  return {
    version:
      typeof parsed.version === 'number' && Number.isFinite(parsed.version) ? Math.round(parsed.version) : null,
    totalDurationMsCeiling,
    stageDurationMsCeilings,
  }
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
  const durationMs = finishedAtMs - startedAtMs

  return {
    exitCode: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    durationMs,
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

function normalizeReplayValue(value) {
  if (typeof value !== 'string') {
    return value
  }

  if (path.isAbsolute(value)) {
    const relative = path.relative(repoRoot, value)
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return toRelativeRepoPath(value)
    }
  }

  return value
}

function captureReplayContextEnv() {
  const captured = {}
  for (const key of REPLAY_CONTEXT_ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue
    }

    const value = process.env[key]
    if (typeof value === 'string' && value.length > 0) {
      captured[key] = value
    }
  }

  return captured
}

function resolveFixtureRefs(fixtureRefs = []) {
  return fixtureRefs.map((fixturePath) => toRelativeRepoPath(path.resolve(repoRoot, fixturePath)))
}

function writeLogs(outputDir, stageId, result, suffix = null) {
  const logsDir = path.join(outputDir, LOG_DIR_NAME)
  fs.mkdirSync(logsDir, { recursive: true })

  const suffixLabel =
    typeof suffix === 'string' && suffix.trim().length > 0 ? `.${suffix.trim()}` : ''
  const stdoutPath = path.join(logsDir, `${stageId}${suffixLabel}.stdout.log`)
  const stderrPath = path.join(logsDir, `${stageId}${suffixLabel}.stderr.log`)

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

  try {
    return readJson(filePath, 'JSON file')
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

function buildStageResult(definition, options, replayContextEnv) {
  const reportsDir = path.join(options.outputDir, REPORT_DIR_NAME)
  fs.mkdirSync(reportsDir, { recursive: true })

  const command = [...definition.command]
  const env = {}
  const artifacts = []
  const fixtureRefs = resolveFixtureRefs(definition.fixtureRefs)
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

  const rawResult = runProcess(command[0], command.slice(1), {
    ...replayContextEnv,
    ...env,
  })
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

  const envOverrides = Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, normalizeReplayValue(value)]),
  )
  const rerunAttempts = []
  let failureClassification = null

  if (rawResult.exitCode !== 0) {
    for (let attempt = 1; attempt <= options.rerunAttempts; attempt += 1) {
      const rerunCommand = [...command]
      const rerunEnv = { ...env }
      const rerunArtifacts = []

      if (definition.kind === 'playwright') {
        const rerunReportPath = path.join(reportsDir, `${definition.id}.rerun-${attempt}.playwright.json`)
        rerunEnv.PLAYWRIGHT_JSON_OUTPUT_NAME = rerunReportPath
        rerunArtifacts.push(toRelativeRepoPath(rerunReportPath))
      }

      if (definition.kind === 'health_snapshot') {
        const rerunHealthOutputDir = path.join(options.outputDir, `retention-health-rerun-${attempt}`)
        for (let index = 0; index < rerunCommand.length; index += 1) {
          if (rerunCommand[index].startsWith('--output-dir=')) {
            rerunCommand[index] = `--output-dir=${rerunHealthOutputDir}`
            break
          }
        }
        rerunArtifacts.push(toRelativeRepoPath(path.join(rerunHealthOutputDir, 'retention-health-summary.json')))
        rerunArtifacts.push(toRelativeRepoPath(path.join(rerunHealthOutputDir, 'retention-health-summary.md')))
        rerunArtifacts.push(toRelativeRepoPath(path.join(rerunHealthOutputDir, 'logs')))
      }

      const rerunResult = runProcess(rerunCommand[0], rerunCommand.slice(1), {
        ...replayContextEnv,
        ...rerunEnv,
      })
      const rerunLogs = writeLogs(options.outputDir, definition.id, rerunResult, `rerun-${attempt}`)
      const rerunStatus = rerunResult.exitCode === 0 ? 'pass' : 'fail'

      rerunAttempts.push({
        attempt,
        status: rerunStatus,
        command: formatCommand(rerunCommand),
        exitCode: rerunResult.exitCode,
        durationMs: rerunResult.durationMs,
        startedAt: rerunResult.startedAt,
        finishedAt: rerunResult.finishedAt,
        errorMessage: rerunResult.errorMessage,
        envOverrides: Object.fromEntries(
          Object.entries(rerunEnv).map(([key, value]) => [key, normalizeReplayValue(value)]),
        ),
        artifactPaths: rerunArtifacts,
        stdoutLogPath: toRelativeRepoPath(rerunLogs.stdoutPath),
        stderrLogPath: toRelativeRepoPath(rerunLogs.stderrPath),
      })

      if (rerunStatus === 'pass') {
        break
      }
    }

    failureClassification =
      rerunAttempts.some((attempt) => attempt.status === 'pass')
        ? 'non_deterministic_flake'
        : 'deterministic_failure'
  }

  return {
    id: definition.id,
    title: definition.title,
    status: rawResult.exitCode === 0 ? 'pass' : 'fail',
    hardBlocker: definition.hardBlocker,
    command: formatCommand(command),
    commandParts: command,
    docs: definition.docs,
    fixtureRefs,
    durationMs: rawResult.durationMs,
    startedAt: rawResult.startedAt,
    finishedAt: rawResult.finishedAt,
    exitCode: rawResult.exitCode,
    envOverrides,
    metrics,
    artifactPaths: artifacts,
    stdoutLogPath: toRelativeRepoPath(logPaths.stdoutPath),
    stderrLogPath: toRelativeRepoPath(logPaths.stderrPath),
    failureClassification,
    rerunDiagnostics:
      rawResult.exitCode === 0
        ? null
        : {
            configuredAttempts: options.rerunAttempts,
            executedAttempts: rerunAttempts.length,
            attempts: rerunAttempts,
            classification: failureClassification,
            classificationLabel: toFailureClassificationLabel(failureClassification),
          },
  }
}

function buildSkippedStageResult(definition, blockedByStageId) {
  return {
    id: definition.id,
    title: definition.title,
    status: 'skipped',
    hardBlocker: definition.hardBlocker,
    command: formatCommand(definition.command),
    commandParts: [...definition.command],
    docs: definition.docs,
    fixtureRefs: resolveFixtureRefs(definition.fixtureRefs),
    durationMs: 0,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    envOverrides: {},
    metrics: {},
    artifactPaths: [],
    stdoutLogPath: null,
    stderrLogPath: null,
    failureClassification: null,
    rerunDiagnostics: null,
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
      failureClassification: stage.failureClassification,
      classificationLabel: toFailureClassificationLabel(stage.failureClassification),
      replayCommand: `npm run gate:retention:replay -- --stage=${stage.id}`,
      rerunDiagnostics: stage.rerunDiagnostics,
      stdoutLogPath: stage.stdoutLogPath,
      stderrLogPath: stage.stderrLogPath,
    }))
}

function toFailureClassificationLabel(classification) {
  if (classification === 'non_deterministic_flake') {
    return 'FLAKE'
  }
  if (classification === 'deterministic_failure') {
    return 'DETERMINISTIC'
  }
  return 'UNKNOWN'
}

function summarizeFailureClassifications(stageResults) {
  const summary = {
    deterministicFailures: 0,
    flakyFailures: 0,
    unclassifiedFailures: 0,
  }

  for (const stage of stageResults) {
    if (stage.status !== 'fail') {
      continue
    }
    if (stage.failureClassification === 'deterministic_failure') {
      summary.deterministicFailures += 1
      continue
    }
    if (stage.failureClassification === 'non_deterministic_flake') {
      summary.flakyFailures += 1
      continue
    }
    summary.unclassifiedFailures += 1
  }

  summary.totalFailed = summary.deterministicFailures + summary.flakyFailures + summary.unclassifiedFailures
  return summary
}

function collectRerunEvidencePaths(stage) {
  if (!stage || !stage.rerunDiagnostics || !Array.isArray(stage.rerunDiagnostics.attempts)) {
    return []
  }

  const paths = []
  for (const attempt of stage.rerunDiagnostics.attempts) {
    if (typeof attempt.stdoutLogPath === 'string' && attempt.stdoutLogPath.length > 0) {
      paths.push(attempt.stdoutLogPath)
    }
    if (typeof attempt.stderrLogPath === 'string' && attempt.stderrLogPath.length > 0) {
      paths.push(attempt.stderrLogPath)
    }
    if (Array.isArray(attempt.artifactPaths)) {
      for (const artifactPath of attempt.artifactPaths) {
        if (typeof artifactPath === 'string' && artifactPath.length > 0) {
          paths.push(artifactPath)
        }
      }
    }
  }

  return paths
}

function uniqueNonEmptyPaths(paths) {
  const uniquePaths = []
  const seen = new Set()

  for (const pathValue of paths) {
    if (typeof pathValue !== 'string' || pathValue.length === 0) {
      continue
    }
    if (seen.has(pathValue)) {
      continue
    }
    seen.add(pathValue)
    uniquePaths.push(pathValue)
  }

  return uniquePaths
}

function formatRerunEvidence(rerunDiagnostics) {
  if (!rerunDiagnostics || !Array.isArray(rerunDiagnostics.attempts) || rerunDiagnostics.attempts.length === 0) {
    return 'none'
  }
  return rerunDiagnostics.attempts
    .map((attempt) => `#${attempt.attempt}:${String(attempt.status).toUpperCase()}(exit=${attempt.exitCode})`)
    .join(', ')
}

function buildRuntimeBudgetEvaluation(stageResults, runtimeBudgets) {
  const executedStages = stageResults.filter((stage) => stage.status !== 'skipped')
  const totalDurationMs = executedStages.reduce((sum, stage) => sum + stage.durationMs, 0)
  const breaches = []

  if (totalDurationMs > runtimeBudgets.totalDurationMsCeiling) {
    breaches.push({
      scope: 'total',
      stageId: null,
      stageTitle: null,
      actualDurationMs: totalDurationMs,
      ceilingDurationMs: runtimeBudgets.totalDurationMsCeiling,
      overBudgetMs: totalDurationMs - runtimeBudgets.totalDurationMsCeiling,
      message: `Total runtime ${totalDurationMs}ms exceeds ceiling ${runtimeBudgets.totalDurationMsCeiling}ms.`,
    })
  }

  for (const stage of executedStages) {
    if (!Object.prototype.hasOwnProperty.call(runtimeBudgets.stageDurationMsCeilings, stage.id)) {
      continue
    }

    const ceiling = runtimeBudgets.stageDurationMsCeilings[stage.id]
    if (stage.durationMs <= ceiling) {
      continue
    }

    breaches.push({
      scope: 'stage',
      stageId: stage.id,
      stageTitle: stage.title,
      actualDurationMs: stage.durationMs,
      ceilingDurationMs: ceiling,
      overBudgetMs: stage.durationMs - ceiling,
      message: `Stage ${stage.id} runtime ${stage.durationMs}ms exceeds ceiling ${ceiling}ms.`,
    })
  }

  return {
    totalDurationMs,
    totalDurationMsCeiling: runtimeBudgets.totalDurationMsCeiling,
    stageDurationMsCeilings: runtimeBudgets.stageDurationMsCeilings,
    executedStageCount: executedStages.length,
    breachCount: breaches.length,
    breaches,
    overallStatus: breaches.length > 0 ? 'fail' : 'pass',
  }
}

function buildRuntimeTimingStages(stageResults, runtimeBudgets, totalDurationMs) {
  return stageResults.map((stage) => {
    const configuredBudgetMs = Object.prototype.hasOwnProperty.call(
      runtimeBudgets.stageDurationMsCeilings,
      stage.id,
    )
      ? runtimeBudgets.stageDurationMsCeilings[stage.id]
      : null

    const overBudgetMs =
      configuredBudgetMs !== null && stage.status !== 'skipped' && stage.durationMs > configuredBudgetMs
        ? stage.durationMs - configuredBudgetMs
        : 0

    const durationSharePct =
      totalDurationMs > 0 && stage.status !== 'skipped'
        ? Number(((stage.durationMs / totalDurationMs) * 100).toFixed(2))
        : 0

    return {
      id: stage.id,
      title: stage.title,
      status: stage.status,
      durationMs: stage.durationMs,
      startedAt: stage.startedAt,
      finishedAt: stage.finishedAt,
      skipReason: stage.skipReason ?? null,
      durationSharePct,
      configuredBudgetMs,
      overBudgetMs,
    }
  })
}

function buildReplayPack(
  options,
  generatedAt,
  stageResults,
  summary,
  runtimeTiming,
  runtimeBudgets,
  replayContextEnv,
) {
  const stageRecords = stageResults.map((stage) => ({
    stageId: stage.id,
    stageTitle: stage.title,
    status: stage.status,
    hardBlocker: stage.hardBlocker,
    skipReason: stage.skipReason ?? null,
    failureClassification: stage.failureClassification,
    classificationLabel:
      stage.failureClassification === null ? null : toFailureClassificationLabel(stage.failureClassification),
    command: {
      binary: stage.commandParts[0] ?? null,
      args: stage.commandParts.slice(1),
      display: stage.command,
      cwd: '.',
    },
    envOverrides: stage.envOverrides,
    fixtureRefs: stage.fixtureRefs,
    docs: stage.docs,
    runtime: {
      startedAt: stage.startedAt,
      finishedAt: stage.finishedAt,
      durationMs: stage.durationMs,
      exitCode: stage.exitCode,
    },
    artifacts: {
      stdoutLogPath: stage.stdoutLogPath,
      stderrLogPath: stage.stderrLogPath,
      stageArtifactPaths: stage.artifactPaths,
    },
    metricSummary: buildMetricSummary(stage),
    rerunDiagnostics: stage.rerunDiagnostics,
  }))

  const failedStages = stageRecords
    .filter((stage) => stage.status === 'fail')
    .map((stage) => ({
      stageId: stage.stageId,
      stageTitle: stage.stageTitle,
      classification: stage.failureClassification,
      classificationLabel:
        stage.failureClassification === null ? null : toFailureClassificationLabel(stage.failureClassification),
      rerunEvidence: formatRerunEvidence(stage.rerunDiagnostics),
      command: stage.command.display,
      replayCommand: `npm run gate:retention:replay -- --stage=${stage.stageId}`,
      stdoutLogPath: stage.artifacts.stdoutLogPath,
      stderrLogPath: stage.artifacts.stderrLogPath,
    }))

  return {
    schemaVersion: 1,
    issueIdentifier: 'VER-105',
    generatedAt,
    replayDefaults: {
      packPath: null,
      defaultReplayCommand: 'npm run gate:retention:replay -- --stage=<stage-id>',
      defaultFailedReplayCommand: 'npm run gate:retention:replay',
      rerunAttempts: options.rerunAttempts,
    },
    gateRun: {
      outputDir: toRelativeRepoPath(options.outputDir),
      failFast: options.failFast,
      runtimeBudgetsPath: toRelativeRepoPath(options.runtimeBudgetsPath),
      runtimeBudgetsSchemaVersion: runtimeBudgets.version,
      git: summary.git,
      runtime: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      envContext: replayContextEnv,
      summary: {
        overallStatus: summary.summary.overallStatus,
        passed: summary.summary.passed,
        failed: summary.summary.failed,
        skipped: summary.summary.skipped,
        runtimeBudgetBreaches: summary.summary.runtimeBudgetBreaches,
        rerunAttempts: options.rerunAttempts,
        failureClassifications: summary.summary.failureClassifications,
      },
    },
    stages: stageRecords,
    failedStages,
    artifacts: {
      summaryJsonPath: summary.jsonArtifactPath,
      summaryMarkdownPath: summary.markdownArtifactPath,
      timingJsonPath: runtimeTiming.jsonArtifactPath,
      timingMarkdownPath: runtimeTiming.markdownArtifactPath,
      logsPath: summary.logsPath,
      reportsPath: summary.reportsPath,
    },
  }
}

function renderReplayPackMarkdown(replayPack, replayPackJsonPath, replayPackMarkdownPath) {
  const lines = [
    '# Tiny Ranch Retention Gate Replay Pack',
    '',
    `- Generated at: ${replayPack.generatedAt}`,
    `- Overall status: **${replayPack.gateRun.summary.overallStatus.toUpperCase()}**`,
    `- Failed-stage rerun attempts configured: ${replayPack.replayDefaults.rerunAttempts ?? 'n/a'}`,
    `- Source summary JSON: \`${replayPack.artifacts.summaryJsonPath}\``,
    `- Runtime timing JSON: \`${replayPack.artifacts.timingJsonPath}\``,
    '',
    '## Replay Commands',
    '',
    '- Replay first failed stage: `npm run gate:retention:replay`',
    '- Replay specific stage: `npm run gate:retention:replay -- --stage=<stage-id>`',
    '',
    '## Failed Stages',
    '',
  ]

  if (replayPack.failedStages.length === 0) {
    lines.push('No failed stages captured in this run.', '')
  } else {
    lines.push('| Stage | Classification | Rerun evidence | Replay command | Stdout log | Stderr log |')
    lines.push('| --- | --- | --- | --- | --- | --- |')
    for (const stage of replayPack.failedStages) {
      lines.push(
        `| ${escapeMarkdownCell(stage.stageId)} | ${escapeMarkdownCell(stage.classificationLabel ?? 'UNKNOWN')} | ${escapeMarkdownCell(stage.rerunEvidence)} | \`${escapeMarkdownCell(stage.replayCommand)}\` | \`${escapeMarkdownCell(stage.stdoutLogPath)}\` | \`${escapeMarkdownCell(stage.stderrLogPath)}\` |`,
      )
    }
    lines.push('')
  }

  lines.push('## Stage Context')
  lines.push('')
  lines.push('| Stage | Status | Command | Key inputs |')
  lines.push('| --- | --- | --- | --- |')
  for (const stage of replayPack.stages) {
    const inputLabel = stage.fixtureRefs.length > 0 ? stage.fixtureRefs.join('<br>') : 'n/a'
    const statusLabel = buildStageStatusLabel(stage)
    lines.push(
      `| ${escapeMarkdownCell(stage.stageId)} | ${escapeMarkdownCell(statusLabel)} | \`${escapeMarkdownCell(stage.command.display)}\` | ${inputLabel} |`,
    )
  }
  lines.push('')

  lines.push('## Artifact Paths')
  lines.push('')
  lines.push(`- Replay pack JSON: \`${replayPackJsonPath}\``)
  lines.push(`- Replay pack Markdown: \`${replayPackMarkdownPath}\``)
  lines.push('')

  return `${lines.join('\n')}\n`
}

function buildStageStatusLabel(stage) {
  if (stage.status === 'pass') {
    return 'PASS'
  }
  if (stage.status === 'fail') {
    return `FAIL (${toFailureClassificationLabel(stage.failureClassification)})`
  }
  return stage.skipReason ? `SKIP (${stage.skipReason})` : 'SKIP'
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

function renderRuntimeTimingMarkdown(timingSummary) {
  const lines = [
    '# Tiny Ranch Retention Release Gate Runtime Timing',
    '',
    `- Generated at: ${timingSummary.generatedAt}`,
    `- Overall status: **${timingSummary.summary.overallStatus.toUpperCase()}**`,
    `- Runtime budget fixture: \`${timingSummary.runtimeBudgetsPath}\``,
    `- Total runtime: ${timingSummary.summary.totalDurationMs} ms`,
    `- Total runtime ceiling: ${timingSummary.summary.totalDurationMsCeiling} ms`,
    `- Runtime budget breaches: ${timingSummary.summary.breachCount}`,
    '',
    '## Stage Timing',
    '',
    '| Stage | Status | Duration (ms) | Share (%) | Ceiling (ms) | Over budget (ms) |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
  ]

  for (const stage of timingSummary.stages) {
    const statusLabel =
      stage.status === 'pass'
        ? 'PASS'
        : stage.status === 'fail'
          ? 'FAIL'
          : stage.skipReason
            ? `SKIP (${stage.skipReason})`
            : 'SKIP'
    lines.push(
      `| ${escapeMarkdownCell(stage.title)} | ${escapeMarkdownCell(statusLabel)} | ${stage.durationMs} | ${stage.durationSharePct.toFixed(2)} | ${stage.configuredBudgetMs ?? 'n/a'} | ${stage.overBudgetMs > 0 ? stage.overBudgetMs : 0} |`,
    )
  }

  lines.push('', '## Budget Breaches', '')

  if (timingSummary.budgetEvaluation.breaches.length === 0) {
    lines.push('No runtime budget breaches detected.', '')
  } else {
    lines.push('| Scope | Stage | Actual (ms) | Ceiling (ms) | Over (ms) |')
    lines.push('| --- | --- | ---: | ---: | ---: |')
    for (const breach of timingSummary.budgetEvaluation.breaches) {
      lines.push(
        `| ${breach.scope === 'total' ? 'total' : 'stage'} | ${escapeMarkdownCell(breach.stageId ?? 'total')} | ${breach.actualDurationMs} | ${breach.ceilingDurationMs} | ${breach.overBudgetMs} |`,
      )
    }
    lines.push('')
  }

  lines.push('## Artifact Paths', '')
  lines.push(`- JSON: \`${timingSummary.jsonArtifactPath}\``)
  lines.push(`- Markdown: \`${timingSummary.markdownArtifactPath}\``)
  lines.push('')

  return `${lines.join('\n')}\n`
}

function formatStageArtifactList(stage) {
  if (!Array.isArray(stage.artifactPaths) || stage.artifactPaths.length === 0) {
    return 'n/a'
  }
  return stage.artifactPaths.map((artifactPath) => `\`${escapeMarkdownCell(artifactPath)}\``).join('<br>')
}

function buildArtifactIndex(summary, runtimeTiming, stageResults) {
  const timingByStageId = new Map(runtimeTiming.stages.map((stage) => [stage.id, stage]))

  return {
    schemaVersion: 1,
    issueIdentifier: 'VER-107',
    generatedAt: summary.generatedAt,
    summary: {
      overallStatus: summary.summary.overallStatus,
      failedStageCount: summary.failures.length,
      runtimeBudgetBreachCount: summary.runtimeTiming.breachCount,
    },
    artifacts: {
      summaryJsonPath: summary.jsonArtifactPath,
      summaryMarkdownPath: summary.markdownArtifactPath,
      timingJsonPath: summary.runtimeTiming.jsonArtifactPath,
      timingMarkdownPath: summary.runtimeTiming.markdownArtifactPath,
      replayPackJsonPath: summary.replayPack.jsonArtifactPath,
      replayPackMarkdownPath: summary.replayPack.markdownArtifactPath,
      artifactIndexJsonPath: summary.artifactIndexPath,
      logsPath: summary.logsPath,
      reportsPath: summary.reportsPath,
    },
    stages: stageResults.map((stage) => {
      const timingStage = timingByStageId.get(stage.id) ?? null
      const classificationEvidencePaths =
        stage.status === 'fail'
          ? uniqueNonEmptyPaths([
              summary.jsonArtifactPath,
              summary.replayPack.jsonArtifactPath,
              stage.stdoutLogPath,
              stage.stderrLogPath,
              ...collectRerunEvidencePaths(stage),
            ])
          : []

      return {
        stageId: stage.id,
        stageTitle: stage.title,
        status: stage.status,
        timing: {
          runtimeTimingJsonPath: summary.runtimeTiming.jsonArtifactPath,
          runtimeTimingMarkdownPath: summary.runtimeTiming.markdownArtifactPath,
          durationMs: timingStage ? timingStage.durationMs : stage.durationMs,
          configuredBudgetMs: timingStage ? timingStage.configuredBudgetMs : null,
          overBudgetMs: timingStage ? timingStage.overBudgetMs : 0,
        },
        replay: {
          replayPackJsonPath: summary.replayPack.jsonArtifactPath,
          replayPackMarkdownPath: summary.replayPack.markdownArtifactPath,
          replayCommand: `npm run gate:retention:replay -- --stage=${stage.id}`,
          defaultFailedReplayCommand: 'npm run gate:retention:replay',
        },
        artifacts: {
          stdoutLogPath: stage.stdoutLogPath,
          stderrLogPath: stage.stderrLogPath,
          stageArtifactPaths: stage.artifactPaths,
        },
        classification: {
          classification: stage.failureClassification,
          classificationLabel: stage.status === 'fail' ? toFailureClassificationLabel(stage.failureClassification) : null,
          evidencePaths: classificationEvidencePaths,
        },
      }
    }),
  }
}

function renderMarkdownSummary(summary) {
  const lines = [
    '# Tiny Ranch Retention Release Gate',
    '',
    `- Generated at: ${summary.generatedAt}`,
    `- Overall status: **${summary.summary.overallStatus.toUpperCase()}**`,
    `- Fail-fast mode: ${summary.options.failFast ? 'enabled' : 'disabled'}`,
    `- Runtime budget fixture: \`${summary.options.runtimeBudgetsPath}\``,
    `- Failed-stage rerun attempts: ${summary.options.rerunAttempts}`,
    '',
    '## Stage Summary',
    '',
    '| Stage | Status | Duration (ms) | Key metrics | Command |',
    '| --- | --- | ---: | --- | --- |',
  ]

  for (const stage of summary.stages) {
    const statusLabel = buildStageStatusLabel(stage)
    lines.push(
      `| ${escapeMarkdownCell(stage.title)} | ${escapeMarkdownCell(statusLabel)} | ${stage.durationMs} | ${escapeMarkdownCell(buildMetricSummary(stage))} | \`${escapeMarkdownCell(stage.command)}\` |`,
    )
  }

  lines.push('', '## Runtime Budget', '')
  lines.push(`- Status: **${summary.runtimeTiming.budgetStatus.toUpperCase()}**`)
  lines.push(
    `- Total runtime: ${summary.runtimeTiming.totalDurationMs} ms (ceiling: ${summary.runtimeTiming.totalDurationMsCeiling} ms)`,
  )
  lines.push(`- Breaches: ${summary.runtimeTiming.breachCount}`)
  lines.push(`- Timing JSON: \`${summary.runtimeTiming.jsonArtifactPath}\``)
  lines.push(`- Timing Markdown: \`${summary.runtimeTiming.markdownArtifactPath}\``)
  lines.push('')

  if (summary.runtimeTiming.breachCount > 0) {
    lines.push('| Scope | Stage | Actual (ms) | Ceiling (ms) | Over (ms) |')
    lines.push('| --- | --- | ---: | ---: | ---: |')
    for (const breach of summary.runtimeTiming.breaches) {
      lines.push(
        `| ${breach.scope === 'total' ? 'total' : 'stage'} | ${escapeMarkdownCell(breach.stageId ?? 'total')} | ${breach.actualDurationMs} | ${breach.ceilingDurationMs} | ${breach.overBudgetMs} |`,
      )
    }
    lines.push('')
  }

  lines.push('', '## Failure Classification', '')
  lines.push(
    `- Deterministic regressions: ${summary.summary.failureClassifications.deterministicFailures}`,
  )
  lines.push(`- Non-deterministic flakes: ${summary.summary.failureClassifications.flakyFailures}`)
  lines.push(`- Unclassified failures: ${summary.summary.failureClassifications.unclassifiedFailures}`)
  lines.push('- Policy: strict fail remains enabled for all failure classes.')
  lines.push('')

  lines.push('', '## Failures', '')
  if (summary.failures.length === 0) {
    lines.push('No blocking failures detected.', '')
  } else {
    lines.push('| Stage | Classification | Exit code | Rerun evidence | Replay command | Stdout log | Stderr log |')
    lines.push('| --- | --- | ---: | --- | --- | --- | --- |')
    for (const failure of summary.failures) {
      lines.push(
        `| ${escapeMarkdownCell(failure.stageId)} | ${escapeMarkdownCell(failure.classificationLabel)} | ${failure.exitCode} | ${escapeMarkdownCell(formatRerunEvidence(failure.rerunDiagnostics))} | \`${escapeMarkdownCell(failure.replayCommand)}\` | \`${escapeMarkdownCell(failure.stdoutLogPath)}\` | \`${escapeMarkdownCell(failure.stderrLogPath)}\` |`,
      )
    }
    lines.push('')
  }

  lines.push('## Stage Artifacts', '')
  lines.push('| Stage | Stdout log | Stderr log | Stage artifacts | Replay command |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const stage of summary.stages) {
    lines.push(
      `| ${escapeMarkdownCell(stage.id)} | ${stage.stdoutLogPath ? `\`${escapeMarkdownCell(stage.stdoutLogPath)}\`` : 'n/a'} | ${stage.stderrLogPath ? `\`${escapeMarkdownCell(stage.stderrLogPath)}\`` : 'n/a'} | ${formatStageArtifactList(stage)} | \`npm run gate:retention:replay -- --stage=${escapeMarkdownCell(stage.id)}\` |`,
    )
  }
  lines.push('')

  lines.push('## Replay Pack', '')
  lines.push(`- Failed stages captured: ${summary.replayPack.failedStageCount}`)
  lines.push(`- Replay JSON: \`${summary.replayPack.jsonArtifactPath}\``)
  lines.push(`- Replay Markdown: \`${summary.replayPack.markdownArtifactPath}\``)
  lines.push('- Replay first failed stage: `npm run gate:retention:replay`')
  lines.push('- Replay specific stage: `npm run gate:retention:replay -- --stage=<stage-id>`')
  lines.push('')

  lines.push('## Artifact Paths', '')
  lines.push(`- JSON: \`${summary.jsonArtifactPath}\``)
  lines.push(`- Markdown: \`${summary.markdownArtifactPath}\``)
  lines.push(`- Runtime timing JSON: \`${summary.runtimeTiming.jsonArtifactPath}\``)
  lines.push(`- Runtime timing Markdown: \`${summary.runtimeTiming.markdownArtifactPath}\``)
  lines.push(`- Replay pack JSON: \`${summary.replayPack.jsonArtifactPath}\``)
  lines.push(`- Replay pack Markdown: \`${summary.replayPack.markdownArtifactPath}\``)
  lines.push(`- Artifact index JSON: \`${summary.artifactIndexPath}\``)
  lines.push(`- Logs: \`${summary.logsPath}\``)
  lines.push(`- Reports: \`${summary.reportsPath}\``)
  lines.push('')

  return `${lines.join('\n')}\n`
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  fs.mkdirSync(options.outputDir, { recursive: true })
  const runtimeBudgets = readRuntimeBudgets(options.runtimeBudgetsPath)
  const replayContextEnv = captureReplayContextEnv()

  const stageResults = []
  let blockedByStageId = null

  for (const definition of STAGE_DEFINITIONS) {
    if (blockedByStageId) {
      stageResults.push(buildSkippedStageResult(definition, blockedByStageId))
      continue
    }

    const result = buildStageResult(definition, options, replayContextEnv)
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
  const failureClassifications = summarizeFailureClassifications(stageResults)

  const failures = buildFailureList(stageResults)
  const summaryJsonPath = path.join(options.outputDir, SUMMARY_JSON_NAME)
  const summaryMarkdownPath = path.join(options.outputDir, SUMMARY_MD_NAME)
  const timingJsonPath = path.join(options.outputDir, TIMING_JSON_NAME)
  const timingMarkdownPath = path.join(options.outputDir, TIMING_MD_NAME)
  const artifactIndexJsonPath = path.join(options.outputDir, ARTIFACT_INDEX_JSON_NAME)
  const replayPackDir = path.join(options.outputDir, REPLAY_PACK_DIR_NAME)
  const replayPackJsonPath = path.join(replayPackDir, REPLAY_PACK_JSON_NAME)
  const replayPackMarkdownPath = path.join(replayPackDir, REPLAY_PACK_MD_NAME)
  const generatedAt = new Date().toISOString()
  fs.mkdirSync(replayPackDir, { recursive: true })

  const runtimeBudgetEvaluation = buildRuntimeBudgetEvaluation(stageResults, runtimeBudgets)
  const runtimeTiming = {
    schemaVersion: 1,
    issueIdentifier: 'VER-104',
    generatedAt,
    runtimeBudgetsPath: toRelativeRepoPath(options.runtimeBudgetsPath),
    summary: {
      overallStatus: runtimeBudgetEvaluation.overallStatus,
      totalDurationMs: runtimeBudgetEvaluation.totalDurationMs,
      totalDurationMsCeiling: runtimeBudgetEvaluation.totalDurationMsCeiling,
      breachCount: runtimeBudgetEvaluation.breachCount,
      executedStageCount: runtimeBudgetEvaluation.executedStageCount,
    },
    budgetEvaluation: runtimeBudgetEvaluation,
    stages: buildRuntimeTimingStages(
      stageResults,
      runtimeBudgets,
      runtimeBudgetEvaluation.totalDurationMs,
    ),
    jsonArtifactPath: toRelativeRepoPath(timingJsonPath),
    markdownArtifactPath: toRelativeRepoPath(timingMarkdownPath),
  }

  const summary = {
    schemaVersion: 1,
    issueIdentifier: 'VER-102',
    generatedAt,
    options: {
      outputDir: toRelativeRepoPath(options.outputDir),
      failFast: options.failFast,
      runtimeBudgetsPath: toRelativeRepoPath(options.runtimeBudgetsPath),
      rerunAttempts: options.rerunAttempts,
    },
    git: resolveGitMetadata(),
    summary: {
      overallStatus: summaryCounts.failed > 0 || runtimeBudgetEvaluation.breachCount > 0 ? 'fail' : 'pass',
      ...summaryCounts,
      runtimeBudgetBreaches: runtimeBudgetEvaluation.breachCount,
      failureClassifications,
    },
    blockedByStageId,
    stages: stageResults,
    failures,
    runtimeTiming: {
      budgetStatus: runtimeBudgetEvaluation.overallStatus,
      totalDurationMs: runtimeBudgetEvaluation.totalDurationMs,
      totalDurationMsCeiling: runtimeBudgetEvaluation.totalDurationMsCeiling,
      breachCount: runtimeBudgetEvaluation.breachCount,
      breaches: runtimeBudgetEvaluation.breaches,
      jsonArtifactPath: toRelativeRepoPath(timingJsonPath),
      markdownArtifactPath: toRelativeRepoPath(timingMarkdownPath),
    },
    replayPack: {
      failedStageCount: failures.length,
      deterministicFailureCount: failureClassifications.deterministicFailures,
      flakyFailureCount: failureClassifications.flakyFailures,
      jsonArtifactPath: toRelativeRepoPath(replayPackJsonPath),
      markdownArtifactPath: toRelativeRepoPath(replayPackMarkdownPath),
    },
    artifactIndexPath: toRelativeRepoPath(artifactIndexJsonPath),
    jsonArtifactPath: toRelativeRepoPath(summaryJsonPath),
    markdownArtifactPath: toRelativeRepoPath(summaryMarkdownPath),
    logsPath: toRelativeRepoPath(path.join(options.outputDir, LOG_DIR_NAME)),
    reportsPath: toRelativeRepoPath(path.join(options.outputDir, REPORT_DIR_NAME)),
  }

  const replayPack = buildReplayPack(
    options,
    generatedAt,
    stageResults,
    summary,
    runtimeTiming,
    runtimeBudgets,
    replayContextEnv,
  )
  replayPack.replayDefaults.packPath = toRelativeRepoPath(replayPackJsonPath)
  replayPack.artifacts.replayPackJsonPath = toRelativeRepoPath(replayPackJsonPath)
  replayPack.artifacts.replayPackMarkdownPath = toRelativeRepoPath(replayPackMarkdownPath)
  replayPack.artifacts.artifactIndexJsonPath = summary.artifactIndexPath

  const artifactIndex = buildArtifactIndex(summary, runtimeTiming, stageResults)

  fs.writeFileSync(timingJsonPath, `${JSON.stringify(runtimeTiming, null, 2)}\n`, 'utf8')
  fs.writeFileSync(timingMarkdownPath, renderRuntimeTimingMarkdown(runtimeTiming), 'utf8')
  fs.writeFileSync(replayPackJsonPath, `${JSON.stringify(replayPack, null, 2)}\n`, 'utf8')
  fs.writeFileSync(
    replayPackMarkdownPath,
    renderReplayPackMarkdown(
      replayPack,
      toRelativeRepoPath(replayPackJsonPath),
      toRelativeRepoPath(replayPackMarkdownPath),
    ),
    'utf8',
  )
  fs.writeFileSync(artifactIndexJsonPath, `${JSON.stringify(artifactIndex, null, 2)}\n`, 'utf8')
  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  fs.writeFileSync(summaryMarkdownPath, renderMarkdownSummary(summary), 'utf8')

  process.stdout.write('[retention-release-gate] artifacts generated:\n')
  process.stdout.write(`- ${summary.jsonArtifactPath}\n`)
  process.stdout.write(`- ${summary.markdownArtifactPath}\n`)
  process.stdout.write(`- ${runtimeTiming.jsonArtifactPath}\n`)
  process.stdout.write(`- ${runtimeTiming.markdownArtifactPath}\n`)
  process.stdout.write(`- ${summary.replayPack.jsonArtifactPath}\n`)
  process.stdout.write(`- ${summary.replayPack.markdownArtifactPath}\n`)
  process.stdout.write(`- ${summary.artifactIndexPath}\n`)
  process.stdout.write(`- ${summary.logsPath}\n`)
  process.stdout.write(`- ${summary.reportsPath}\n`)

  if (summary.summary.overallStatus === 'fail') {
    if (failures.length > 0) {
      const firstFailure = failures[0]
      process.stderr.write(
        `[retention-release-gate] blocking stage failed: ${firstFailure ? firstFailure.stageId : 'unknown'}\n`,
      )
      process.stderr.write(
        `[retention-release-gate] failure classification: deterministic=${failureClassifications.deterministicFailures} flaky=${failureClassifications.flakyFailures} unclassified=${failureClassifications.unclassifiedFailures}\n`,
      )
      for (const failure of failures) {
        process.stderr.write(
          `- [${failure.stageId}] class=${failure.classificationLabel} reruns=${formatRerunEvidence(failure.rerunDiagnostics)} replay="${failure.replayCommand}"\n`,
        )
      }
    }

    if (runtimeBudgetEvaluation.breachCount > 0) {
      process.stderr.write(
        `[retention-release-gate] runtime budget breaches: ${runtimeBudgetEvaluation.breachCount}\n`,
      )
      for (const breach of runtimeBudgetEvaluation.breaches) {
        if (breach.scope === 'total') {
          process.stderr.write(
            `- [total] actual=${breach.actualDurationMs}ms ceiling=${breach.ceilingDurationMs}ms over=${breach.overBudgetMs}ms\n`,
          )
          continue
        }

        process.stderr.write(
          `- [${breach.stageId}] actual=${breach.actualDurationMs}ms ceiling=${breach.ceilingDurationMs}ms over=${breach.overBudgetMs}ms\n`,
        )
      }
    }

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
