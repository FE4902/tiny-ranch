#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const DEFAULT_OUTPUT_DIR = path.join(repoRoot, 'artifacts/retention-health')
const DEFAULT_THRESHOLDS_PATH = path.join(
  repoRoot,
  'tests/fixtures/analytics/retention-health-thresholds.fixture.json',
)
const LOG_DIR_NAME = 'logs'
const SUMMARY_JSON_NAME = 'retention-health-summary.json'
const SUMMARY_MD_NAME = 'retention-health-summary.md'
const MAX_BUFFER_BYTES = 32 * 1024 * 1024

const CHECK_DEFINITIONS = [
  {
    id: 'telemetry_contract',
    title: 'Retention telemetry contract',
    owner: 'Telemetry schema/runtime payload parity',
    subsystem: 'src/game/systems/telemetry.ts + src/game/systems/runtime.ts',
    command: ['node', 'scripts/validate-retention-telemetry-contract.mjs'],
    thresholdKey: 'telemetryContract',
    docs: ['docs/ver-101-retention-health-snapshot-gate.md'],
    kind: 'core',
  },
  {
    id: 'cohort_export',
    title: 'Retention cohort deterministic export',
    owner: 'Analytics retention cohort summarization',
    subsystem: 'scripts/export-retention-cohorts.mjs',
    command: ['node', 'scripts/test-retention-cohort-export.mjs'],
    thresholdKey: 'cohortExport',
    docs: ['docs/ver-101-retention-health-snapshot-gate.md'],
    kind: 'core',
  },
  {
    id: 'objective_balance',
    title: 'Return objective economy guardrails',
    owner: 'Return objective/streak reward economics',
    subsystem: 'src/game/config/returnObjectiveEconomyTuning.shared.js',
    command: ['node', 'scripts/check-return-objective-balance.mjs'],
    thresholdKey: 'balance',
    docs: ['docs/ver-91-objective-streak-economy-guardrails.md'],
    kind: 'core',
  },
  {
    id: 'retention_soak',
    title: 'Retention soak deterministic matrix',
    owner: 'Retention objective + save/load replay invariants',
    subsystem: 'scripts/check-retention-soak.mjs',
    command: ['node', 'scripts/check-retention-soak.mjs'],
    thresholdKey: 'soak',
    docs: ['docs/ver-96-retention-soak-harness.md'],
    kind: 'core',
  },
  {
    id: 'save_migration_matrix',
    title: 'Save migration compatibility matrix',
    owner: 'Save migration decode/re-save safety',
    subsystem: 'tests/smoke/save-migration-matrix.spec.ts',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      '--project=desktop-chromium',
      'tests/smoke/save-migration-matrix.spec.ts',
      '--reporter=json',
    ],
    thresholdKey: 'saveMigration',
    docs: ['docs/ver-93-save-migration-compatibility-matrix.md'],
    kind: 'playwright',
  },
  {
    id: 'retention_memory_gate',
    title: 'Mobile retention memory gate',
    owner: 'Mobile memory/frame drift thresholds',
    subsystem: 'tests/smoke/retention-memory-gate.spec.ts',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      '--project=mobile-chromium',
      'tests/smoke/retention-memory-gate.spec.ts',
      '--reporter=json',
    ],
    thresholdKey: 'memoryGate',
    docs: ['docs/ver-100-mobile-memory-drift-gate.md'],
    kind: 'playwright',
  },
]

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/report-retention-health.mjs [options]',
      '',
      'Options:',
      '  --run-playwright             Include save-migration and memory Playwright gates.',
      '  --output-dir=<path>          Output directory for JSON/Markdown/log artifacts.',
      '  --thresholds=<path>          Threshold fixture JSON path override.',
      '  --save-migration-report=<path> Reuse an existing save migration Playwright JSON report.',
      '  --memory-gate-report=<path>  Reuse an existing memory gate Playwright JSON report.',
      '  --help                       Show this message.',
      '',
    ].join('\n'),
  )
}

function parseArgs(argv) {
  const options = {
    runPlaywright: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    thresholdsPath: DEFAULT_THRESHOLDS_PATH,
    saveMigrationReportPath: null,
    memoryGateReportPath: null,
  }

  for (const arg of argv) {
    if (arg === '--') {
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg === '--run-playwright') {
      options.runPlaywright = true
      continue
    }

    if (arg.startsWith('--output-dir=')) {
      const rawPath = arg.slice('--output-dir='.length)
      if (rawPath.trim().length === 0) {
        throw new Error('--output-dir requires a non-empty path.')
      }

      options.outputDir = path.resolve(process.cwd(), rawPath)
      continue
    }

    if (arg.startsWith('--thresholds=')) {
      const rawPath = arg.slice('--thresholds='.length)
      if (rawPath.trim().length === 0) {
        throw new Error('--thresholds requires a non-empty path.')
      }

      options.thresholdsPath = path.resolve(process.cwd(), rawPath)
      continue
    }

    if (arg.startsWith('--save-migration-report=')) {
      const rawPath = arg.slice('--save-migration-report='.length)
      if (rawPath.trim().length === 0) {
        throw new Error('--save-migration-report requires a non-empty path.')
      }

      options.saveMigrationReportPath = path.resolve(process.cwd(), rawPath)
      continue
    }

    if (arg.startsWith('--memory-gate-report=')) {
      const rawPath = arg.slice('--memory-gate-report='.length)
      if (rawPath.trim().length === 0) {
        throw new Error('--memory-gate-report requires a non-empty path.')
      }

      options.memoryGateReportPath = path.resolve(process.cwd(), rawPath)
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
    throw new Error(`Could not parse ${description} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function readThresholds(thresholdsPath) {
  const parsed = readJson(thresholdsPath, 'threshold fixture')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Threshold fixture at ${thresholdsPath} must be an object.`)
  }

  if (!parsed.checks || typeof parsed.checks !== 'object' || Array.isArray(parsed.checks)) {
    throw new Error(`Threshold fixture at ${thresholdsPath} must include a "checks" object.`)
  }

  return parsed
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
    errorMessage: result.error ? (result.error instanceof Error ? result.error.message : String(result.error)) : null,
  }
}

function toRelativeRepoPath(filePath) {
  return path.relative(repoRoot, filePath)
}

function createThresholdViolation(metric, actual, expected, message) {
  return {
    metric,
    actual,
    expected,
    message,
  }
}

function parseTelemetryContractOutput(stdout) {
  const summaryMatch = stdout.match(
    /\[retention-contract\] validated (\d+) retention telemetry events using (.+)\./,
  )

  const validatedEvents = summaryMatch ? Number.parseInt(summaryMatch[1], 10) : null
  const fixturePath = summaryMatch ? summaryMatch[2] : null

  return {
    validatedEvents,
    fixturePath,
  }
}

function evaluateTelemetryContract(checkResult, thresholdConfig) {
  const metrics = parseTelemetryContractOutput(checkResult.stdout)
  const thresholdViolations = []
  const minimumValidatedEvents = Number.parseInt(
    String(thresholdConfig?.minimumValidatedEvents ?? 0),
    10,
  )

  if (!Number.isFinite(metrics.validatedEvents)) {
    thresholdViolations.push(
      createThresholdViolation(
        'validatedEvents',
        null,
        minimumValidatedEvents,
        'Could not parse validated event count from telemetry contract output.',
      ),
    )
  } else if (metrics.validatedEvents < minimumValidatedEvents) {
    thresholdViolations.push(
      createThresholdViolation(
        'validatedEvents',
        metrics.validatedEvents,
        `>= ${minimumValidatedEvents}`,
        'Validated telemetry event count is below the source-controlled minimum.',
      ),
    )
  }

  return {
    metrics,
    thresholdViolations,
  }
}

function parseCohortExportOutput(stdout) {
  const summaryMatch = stdout.match(
    /\[retention-cohort-export\] verified deterministic summary for (\d+) sample events\./,
  )

  return {
    sampleEvents: summaryMatch ? Number.parseInt(summaryMatch[1], 10) : null,
  }
}

function evaluateCohortExport(checkResult, thresholdConfig) {
  const metrics = parseCohortExportOutput(checkResult.stdout)
  const thresholdViolations = []
  const minimumSampleEvents = Number.parseInt(String(thresholdConfig?.minimumSampleEvents ?? 0), 10)

  if (!Number.isFinite(metrics.sampleEvents)) {
    thresholdViolations.push(
      createThresholdViolation(
        'sampleEvents',
        null,
        minimumSampleEvents,
        'Could not parse sample event count from retention cohort export output.',
      ),
    )
  } else if (metrics.sampleEvents < minimumSampleEvents) {
    thresholdViolations.push(
      createThresholdViolation(
        'sampleEvents',
        metrics.sampleEvents,
        `>= ${minimumSampleEvents}`,
        'Sample event count is below the source-controlled minimum.',
      ),
    )
  }

  return {
    metrics,
    thresholdViolations,
  }
}

function parseBalanceOutput(stdout) {
  const scenarioRows = []
  const rowPattern =
    /^\| ([^|]+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| ([0-9.]+)% \| ([+\-]?[0-9.]+)% \| ([+\-]?[0-9.]+)% \| (PASS|FAIL) \|$/

  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(rowPattern)
    if (!match) {
      continue
    }

    scenarioRows.push({
      scenario: match[1].trim(),
      sessions: Number.parseInt(match[2], 10),
      earned: Number.parseInt(match[3], 10),
      spent: Number.parseInt(match[4], 10),
      net: Number.parseInt(match[5], 10),
      streakBonus: Number.parseInt(match[6], 10),
      bonusSharePct: Number.parseFloat(match[7]),
      rewardDeltaPct: Number.parseFloat(match[8]),
      netDeltaPct: Number.parseFloat(match[9]),
      status: match[10],
    })
  }

  const failingScenarios = scenarioRows.filter((row) => row.status === 'FAIL').length

  return {
    scenarioCount: scenarioRows.length,
    failingScenarios,
    scenarios: scenarioRows,
  }
}

function evaluateBalance(checkResult, thresholdConfig) {
  const metrics = parseBalanceOutput(checkResult.stdout)
  const thresholdViolations = []

  const minimumScenarioCount = Number.parseInt(String(thresholdConfig?.minimumScenarioCount ?? 0), 10)
  const maximumFailingScenarios = Number.parseInt(
    String(thresholdConfig?.maximumFailingScenarios ?? 0),
    10,
  )

  if (metrics.scenarioCount === 0) {
    thresholdViolations.push(
      createThresholdViolation(
        'scenarioCount',
        0,
        `>= ${minimumScenarioCount}`,
        'Could not parse any scenario rows from objective balance output.',
      ),
    )
  } else if (metrics.scenarioCount < minimumScenarioCount) {
    thresholdViolations.push(
      createThresholdViolation(
        'scenarioCount',
        metrics.scenarioCount,
        `>= ${minimumScenarioCount}`,
        'Objective balance scenario coverage is below the configured minimum.',
      ),
    )
  }

  if (metrics.failingScenarios > maximumFailingScenarios) {
    thresholdViolations.push(
      createThresholdViolation(
        'failingScenarios',
        metrics.failingScenarios,
        `<= ${maximumFailingScenarios}`,
        'Objective balance guardrail failures exceed the configured threshold.',
      ),
    )
  }

  const minimumStreakBonusByScenario =
    thresholdConfig?.minimumStreakBonusByScenario &&
    typeof thresholdConfig.minimumStreakBonusByScenario === 'object' &&
    !Array.isArray(thresholdConfig.minimumStreakBonusByScenario)
      ? thresholdConfig.minimumStreakBonusByScenario
      : {}

  for (const [scenarioId, minimumRaw] of Object.entries(minimumStreakBonusByScenario)) {
    const scenario = metrics.scenarios.find((candidate) => candidate.scenario === scenarioId)
    const minimum = Number.parseInt(String(minimumRaw), 10)

    if (!scenario) {
      thresholdViolations.push(
        createThresholdViolation(
          `streakBonus.${scenarioId}`,
          null,
          `>= ${minimum}`,
          `Scenario "${scenarioId}" is missing from objective balance output.`,
        ),
      )
      continue
    }

    if (scenario.streakBonus < minimum) {
      thresholdViolations.push(
        createThresholdViolation(
          `streakBonus.${scenarioId}`,
          scenario.streakBonus,
          `>= ${minimum}`,
          `Scenario "${scenarioId}" streak bonus total is below the configured continuity floor.`,
        ),
      )
    }
  }

  return {
    metrics,
    thresholdViolations,
  }
}

function parseSoakOutput(stdout) {
  const caseRows = []
  const rowPattern =
    /^\| ([^|]+) \| obj:(\d),streak:(\d),kill:(\d) \| obj:(\d),streak:(\d),kill:(\d) \| (\d+) \| (\d+) \| (\d+) \| (-?\d+) \| ([a-f0-9]{12}) \| (PASS|FAIL) \|$/

  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(rowPattern)
    if (!match) {
      continue
    }

    caseRows.push({
      scenario: match[1].trim(),
      rawFlags: {
        objectiveLoopEnabled: match[2] === '1',
        streakBonusEnabled: match[3] === '1',
        retentionKillSwitchEnabled: match[4] === '1',
      },
      effectiveFlags: {
        objectiveLoopEnabled: match[5] === '1',
        streakBonusEnabled: match[6] === '1',
        retentionKillSwitchEnabled: match[7] === '1',
      },
      sessions: Number.parseInt(match[8], 10),
      claims: Number.parseInt(match[9], 10),
      saveLoadCount: Number.parseInt(match[10], 10),
      finalCurrency: Number.parseInt(match[11], 10),
      digest: match[12],
      status: match[13],
    })
  }

  const failingCases = caseRows.filter((row) => row.status === 'FAIL').length
  const objectiveEnabledCases = caseRows.filter((row) => row.effectiveFlags.objectiveLoopEnabled)
  const claimRates = objectiveEnabledCases.map((row) => (row.sessions > 0 ? row.claims / row.sessions : 0))

  return {
    caseCount: caseRows.length,
    failingCases,
    objectiveEnabledCaseCount: objectiveEnabledCases.length,
    minimumObjectiveEnabledClaimRate:
      claimRates.length > 0 ? Math.min(...claimRates) : null,
    cases: caseRows,
  }
}

function evaluateSoak(checkResult, thresholdConfig) {
  const metrics = parseSoakOutput(checkResult.stdout)
  const thresholdViolations = []

  const minimumMatrixCaseCount = Number.parseInt(String(thresholdConfig?.minimumMatrixCaseCount ?? 0), 10)
  const maximumFailingCases = Number.parseInt(String(thresholdConfig?.maximumFailingCases ?? 0), 10)
  const minimumObjectiveEnabledCases = Number.parseInt(
    String(thresholdConfig?.minimumObjectiveEnabledCases ?? 0),
    10,
  )
  const minimumObjectiveEnabledClaimRate = Number.parseFloat(
    String(thresholdConfig?.minimumObjectiveEnabledClaimRate ?? 0),
  )

  if (metrics.caseCount === 0) {
    thresholdViolations.push(
      createThresholdViolation(
        'caseCount',
        0,
        `>= ${minimumMatrixCaseCount}`,
        'Could not parse any case rows from retention soak output.',
      ),
    )
  } else if (metrics.caseCount < minimumMatrixCaseCount) {
    thresholdViolations.push(
      createThresholdViolation(
        'caseCount',
        metrics.caseCount,
        `>= ${minimumMatrixCaseCount}`,
        'Retention soak matrix coverage is below the configured minimum.',
      ),
    )
  }

  if (metrics.failingCases > maximumFailingCases) {
    thresholdViolations.push(
      createThresholdViolation(
        'failingCases',
        metrics.failingCases,
        `<= ${maximumFailingCases}`,
        'Retention soak failures exceed the configured threshold.',
      ),
    )
  }

  if (metrics.objectiveEnabledCaseCount < minimumObjectiveEnabledCases) {
    thresholdViolations.push(
      createThresholdViolation(
        'objectiveEnabledCaseCount',
        metrics.objectiveEnabledCaseCount,
        `>= ${minimumObjectiveEnabledCases}`,
        'Objective-enabled retention soak coverage is below the configured minimum.',
      ),
    )
  }

  if (metrics.minimumObjectiveEnabledClaimRate === null) {
    thresholdViolations.push(
      createThresholdViolation(
        'minimumObjectiveEnabledClaimRate',
        null,
        `>= ${minimumObjectiveEnabledClaimRate}`,
        'Could not compute objective-enabled claim completion rate from soak output.',
      ),
    )
  } else if (metrics.minimumObjectiveEnabledClaimRate < minimumObjectiveEnabledClaimRate) {
    thresholdViolations.push(
      createThresholdViolation(
        'minimumObjectiveEnabledClaimRate',
        Number(metrics.minimumObjectiveEnabledClaimRate.toFixed(6)),
        `>= ${minimumObjectiveEnabledClaimRate}`,
        'Claim completion stability fell below the configured threshold.',
      ),
    )
  }

  return {
    metrics,
    thresholdViolations,
  }
}

function parsePlaywrightReportFromFile(reportPath) {
  if (!fs.existsSync(reportPath)) {
    return null
  }

  return readJson(reportPath, 'Playwright JSON report')
}

function parsePlaywrightStats(report) {
  if (!report || typeof report !== 'object') {
    return null
  }

  const stats = report.stats && typeof report.stats === 'object' ? report.stats : null
  if (!stats) {
    return null
  }

  const passed = Number.parseInt(String(stats.expected ?? 0), 10)
  const failedUnexpected = Number.parseInt(String(stats.unexpected ?? 0), 10)
  const failedFlaky = Number.parseInt(String(stats.flaky ?? 0), 10)
  const skipped = Number.parseInt(String(stats.skipped ?? 0), 10)

  const failed = Math.max(0, failedUnexpected + failedFlaky)
  const total = Math.max(0, passed + failed + skipped)

  return {
    total,
    passed,
    failed,
    skipped,
    durationMs: Number.parseInt(String(stats.duration ?? 0), 10),
  }
}

function evaluatePlaywright(checkResult, thresholdConfig, reportPath) {
  const thresholdViolations = []
  const parsedReport = parsePlaywrightReportFromFile(reportPath)
  const stats = parsePlaywrightStats(parsedReport)

  if (!stats) {
    thresholdViolations.push(
      createThresholdViolation(
        'playwrightStats',
        null,
        'valid JSON stats',
        'Could not parse Playwright JSON stats.',
      ),
    )

    return {
      metrics: {
        total: null,
        passed: null,
        failed: null,
        skipped: null,
        reportPath: toRelativeRepoPath(reportPath),
      },
      thresholdViolations,
    }
  }

  const minimumPassedTests = Number.parseInt(String(thresholdConfig?.minimumPassedTests ?? 0), 10)
  const maximumFailedTests = Number.parseInt(String(thresholdConfig?.maximumFailedTests ?? 0), 10)

  if (stats.passed < minimumPassedTests) {
    thresholdViolations.push(
      createThresholdViolation(
        'passedTests',
        stats.passed,
        `>= ${minimumPassedTests}`,
        'Playwright passed test count is below the configured minimum.',
      ),
    )
  }

  if (stats.failed > maximumFailedTests) {
    thresholdViolations.push(
      createThresholdViolation(
        'failedTests',
        stats.failed,
        `<= ${maximumFailedTests}`,
        'Playwright failed test count is above the configured maximum.',
      ),
    )
  }

  return {
    metrics: {
      ...stats,
      reportPath: toRelativeRepoPath(reportPath),
    },
    thresholdViolations,
  }
}

function evaluateCheck(definition, checkResult, thresholdConfig, playwrightReportPath = null) {
  if (definition.id === 'telemetry_contract') {
    return evaluateTelemetryContract(checkResult, thresholdConfig)
  }

  if (definition.id === 'cohort_export') {
    return evaluateCohortExport(checkResult, thresholdConfig)
  }

  if (definition.id === 'objective_balance') {
    return evaluateBalance(checkResult, thresholdConfig)
  }

  if (definition.id === 'retention_soak') {
    return evaluateSoak(checkResult, thresholdConfig)
  }

  if (definition.kind === 'playwright') {
    return evaluatePlaywright(checkResult, thresholdConfig, playwrightReportPath)
  }

  return {
    metrics: {},
    thresholdViolations: [],
  }
}

function formatCommand(command) {
  return command.join(' ')
}

function writeCheckLogs(outputDir, checkId, checkResult) {
  const logsDir = path.join(outputDir, LOG_DIR_NAME)
  fs.mkdirSync(logsDir, { recursive: true })

  const stdoutPath = path.join(logsDir, `${checkId}.stdout.log`)
  const stderrPath = path.join(logsDir, `${checkId}.stderr.log`)

  fs.writeFileSync(stdoutPath, checkResult.stdout, 'utf8')
  fs.writeFileSync(stderrPath, checkResult.stderr, 'utf8')

  return {
    stdoutPath,
    stderrPath,
  }
}

function resolvePlaywrightReportOverride(definition, options) {
  if (definition.id === 'save_migration_matrix') {
    return options.saveMigrationReportPath
  }

  if (definition.id === 'retention_memory_gate') {
    return options.memoryGateReportPath
  }

  return null
}

function buildMetricSummary(check) {
  if (check.status === 'skipped') {
    return check.skipReason ?? 'skipped'
  }

  if (check.id === 'telemetry_contract') {
    return `${check.metrics.validatedEvents ?? 0} events validated`
  }

  if (check.id === 'cohort_export') {
    return `${check.metrics.sampleEvents ?? 0} sample events`
  }

  if (check.id === 'objective_balance') {
    return `${check.metrics.scenarioCount ?? 0} scenarios, ${check.metrics.failingScenarios ?? 0} failing`
  }

  if (check.id === 'retention_soak') {
    const claimRate = check.metrics.minimumObjectiveEnabledClaimRate
    const claimRateLabel =
      Number.isFinite(claimRate) && claimRate !== null
        ? `${(claimRate * 100).toFixed(1)}% min claim rate`
        : 'claim rate unavailable'
    return `${check.metrics.caseCount ?? 0} cases, ${claimRateLabel}`
  }

  if (check.id === 'save_migration_matrix' || check.id === 'retention_memory_gate') {
    return `${check.metrics.passed ?? 0}/${check.metrics.total ?? 0} tests passed`
  }

  return 'n/a'
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, '\\|')
}

function formatStatus(status) {
  if (status === 'pass') {
    return 'PASS'
  }

  if (status === 'fail') {
    return 'FAIL'
  }

  return 'SKIP'
}

function renderMarkdownSummary(summary) {
  const lines = [
    '# Tiny Ranch Retention Health Snapshot',
    '',
    `- Generated at: ${summary.generatedAt}`,
    `- Overall status: **${summary.summary.overallStatus.toUpperCase()}**`,
    `- Threshold fixture: \`${summary.thresholdsPath}\``,
    `- Playwright checks enabled: ${summary.options.runPlaywright ? 'yes' : 'no'}`,
    '',
    '## Check Summary',
    '',
    '| Check | Status | Key metrics | Owner | Command |',
    '| --- | --- | --- | --- | --- |',
  ]

  for (const check of summary.checks) {
    lines.push(
      `| ${escapeMarkdownCell(check.title)} | ${formatStatus(check.status)} | ${escapeMarkdownCell(buildMetricSummary(check))} | ${escapeMarkdownCell(check.owner)} | \`${escapeMarkdownCell(check.command)}\` |`,
    )
  }

  lines.push('', '## Threshold Breaches', '')

  if (summary.failures.length === 0) {
    lines.push('No threshold breaches detected.', '')
  } else {
    lines.push('| Metric | Check | Actual | Expected | Owning subsystem/check |')
    lines.push('| --- | --- | --- | --- | --- |')
    for (const failure of summary.failures) {
      lines.push(
        `| ${escapeMarkdownCell(failure.metric)} | ${escapeMarkdownCell(failure.checkId)} | ${escapeMarkdownCell(failure.actual)} | ${escapeMarkdownCell(failure.expected)} | ${escapeMarkdownCell(`${failure.owner} (${failure.subsystem})`)} |`,
      )
    }
    lines.push('')
  }

  lines.push('## Artifact Paths', '')
  lines.push(`- JSON: \`${summary.jsonArtifactPath}\``)
  lines.push(`- Markdown: \`${summary.markdownArtifactPath}\``)
  lines.push(`- Logs: \`${summary.logsPath}\``)
  lines.push('')

  return `${lines.join('\n')}\n`
}

function resolveGitMetadata() {
  const commit = runProcess('git', ['rev-parse', 'HEAD'])
  const branch = runProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD'])

  return {
    commit: commit.exitCode === 0 ? commit.stdout.trim() : null,
    branch: branch.exitCode === 0 ? branch.stdout.trim() : null,
  }
}

function executeCheck(definition, options, thresholds, outputDir) {
  const thresholdConfig = thresholds.checks[definition.thresholdKey] ?? {}
  const reportOverridePath =
    definition.kind === 'playwright' ? resolvePlaywrightReportOverride(definition, options) : null

  if (definition.kind === 'playwright' && reportOverridePath) {
    const evaluated = evaluateCheck(
      definition,
      { exitCode: 0, stdout: '', stderr: '', durationMs: 0 },
      thresholdConfig,
      reportOverridePath,
    )
    const thresholdViolations = [...evaluated.thresholdViolations]

    return {
      id: definition.id,
      title: definition.title,
      owner: definition.owner,
      subsystem: definition.subsystem,
      docs: definition.docs,
      command: `${formatCommand(definition.command)} (reused report: ${toRelativeRepoPath(reportOverridePath)})`,
      status: thresholdViolations.length === 0 ? 'pass' : 'fail',
      skipReason: null,
      durationMs: 0,
      exitCode: 0,
      metrics: evaluated.metrics,
      thresholdViolations,
      stdoutLogPath: null,
      stderrLogPath: null,
      reportPath: toRelativeRepoPath(reportOverridePath),
    }
  }

  if (definition.kind === 'playwright' && !options.runPlaywright) {
    return {
      id: definition.id,
      title: definition.title,
      owner: definition.owner,
      subsystem: definition.subsystem,
      docs: definition.docs,
      command: formatCommand(definition.command),
      status: 'skipped',
      skipReason: 'Playwright checks not requested for this run.',
      durationMs: 0,
      exitCode: null,
      metrics: {},
      thresholdViolations: [],
      stdoutLogPath: null,
      stderrLogPath: null,
    }
  }

  let playwrightReportPath = null
  const extraEnv = {}
  if (definition.kind === 'playwright') {
    const reportDir = path.join(outputDir, 'reports')
    fs.mkdirSync(reportDir, { recursive: true })
    playwrightReportPath = path.join(reportDir, `${definition.id}.playwright.json`)
    extraEnv.PLAYWRIGHT_JSON_OUTPUT_NAME = playwrightReportPath
  }

  const rawCheckResult = runProcess(definition.command[0], definition.command.slice(1), extraEnv)
  const logPaths = writeCheckLogs(outputDir, definition.id, rawCheckResult)

  const evaluated = evaluateCheck(definition, rawCheckResult, thresholdConfig, playwrightReportPath)
  const thresholdViolations = [...evaluated.thresholdViolations]

  if (rawCheckResult.exitCode !== 0) {
    thresholdViolations.push(
      createThresholdViolation(
        'commandExitCode',
        rawCheckResult.exitCode,
        0,
        rawCheckResult.errorMessage
          ? `Command execution failed: ${rawCheckResult.errorMessage}`
          : 'Check command exited non-zero.',
      ),
    )
  }

  return {
    id: definition.id,
    title: definition.title,
    owner: definition.owner,
    subsystem: definition.subsystem,
    docs: definition.docs,
    command: formatCommand(definition.command),
    status: thresholdViolations.length === 0 ? 'pass' : 'fail',
    skipReason: null,
    durationMs: rawCheckResult.durationMs,
    exitCode: rawCheckResult.exitCode,
    metrics: evaluated.metrics,
    thresholdViolations,
    stdoutLogPath: toRelativeRepoPath(logPaths.stdoutPath),
    stderrLogPath: toRelativeRepoPath(logPaths.stderrPath),
    reportPath: playwrightReportPath ? toRelativeRepoPath(playwrightReportPath) : null,
  }
}

function buildFailureList(checks) {
  const failures = []

  for (const check of checks) {
    if (check.status !== 'fail') {
      continue
    }

    for (const violation of check.thresholdViolations) {
      failures.push({
        checkId: check.id,
        checkTitle: check.title,
        metric: violation.metric,
        actual: violation.actual,
        expected: violation.expected,
        message: violation.message,
        owner: check.owner,
        subsystem: check.subsystem,
        command: check.command,
      })
    }
  }

  return failures
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const thresholds = readThresholds(options.thresholdsPath)

  fs.mkdirSync(options.outputDir, { recursive: true })

  const checks = CHECK_DEFINITIONS.map((definition) =>
    executeCheck(definition, options, thresholds, options.outputDir),
  )

  const summaryCounts = {
    total: checks.length,
    passed: checks.filter((check) => check.status === 'pass').length,
    failed: checks.filter((check) => check.status === 'fail').length,
    skipped: checks.filter((check) => check.status === 'skipped').length,
  }

  const failures = buildFailureList(checks)
  const summaryJsonPath = path.join(options.outputDir, SUMMARY_JSON_NAME)
  const summaryMarkdownPath = path.join(options.outputDir, SUMMARY_MD_NAME)

  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    issueIdentifier: 'VER-101',
    thresholdsPath: toRelativeRepoPath(options.thresholdsPath),
    options: {
      runPlaywright: options.runPlaywright,
      outputDir: toRelativeRepoPath(options.outputDir),
      saveMigrationReportPath: options.saveMigrationReportPath
        ? toRelativeRepoPath(options.saveMigrationReportPath)
        : null,
      memoryGateReportPath: options.memoryGateReportPath
        ? toRelativeRepoPath(options.memoryGateReportPath)
        : null,
    },
    git: resolveGitMetadata(),
    summary: {
      overallStatus: summaryCounts.failed > 0 ? 'fail' : 'pass',
      ...summaryCounts,
    },
    checks,
    failures,
    jsonArtifactPath: toRelativeRepoPath(summaryJsonPath),
    markdownArtifactPath: toRelativeRepoPath(summaryMarkdownPath),
    logsPath: toRelativeRepoPath(path.join(options.outputDir, LOG_DIR_NAME)),
  }

  fs.writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  fs.writeFileSync(summaryMarkdownPath, renderMarkdownSummary(summary), 'utf8')

  process.stdout.write('[retention-health] artifacts generated:\n')
  process.stdout.write(`- ${summary.jsonArtifactPath}\n`)
  process.stdout.write(`- ${summary.markdownArtifactPath}\n`)
  process.stdout.write(`- ${summary.logsPath}\n`)

  if (summary.summary.overallStatus === 'fail') {
    process.stderr.write(`[retention-health] failed checks: ${summary.summary.failed}\n`)
    for (const failure of failures) {
      process.stderr.write(
        `- [${failure.checkId}] ${failure.metric}: actual=${failure.actual} expected=${failure.expected} (${failure.message})\n`,
      )
    }
    process.exit(1)
  }
}

try {
  run()
} catch (error) {
  process.stderr.write(`[retention-health] failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
