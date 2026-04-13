#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { returnObjectiveEconomyTuning } from '../src/game/config/returnObjectiveEconomyTuning.shared.js'

const MS_PER_HOUR = 60 * 60 * 1000
const DEFAULT_SOAK_MULTIPLIER = 8
const DEFAULT_SAVE_INTERVAL = 5
const BASE_STREAK_TIER_CONFIG = Object.freeze({
  tier: 0,
  rewardMultiplier: 1,
  rewardBonus: 0,
})
const BASELINE_FIXTURE_PATH = path.resolve(
  process.cwd(),
  'tests/fixtures/save/retention-soak-baseline.fixture.json',
)

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/check-retention-soak.mjs [options]',
      '',
      'Options:',
      '  --seed=<number>           Deterministic objective assignment seed override.',
      '  --multiplier=<number>     Multiply each configured scenario session count (default: 8).',
      '  --save-interval=<number>  Save/load round-trip cadence in sessions (default: 5).',
      '  --scenario=<id[,id]>      Run only selected deterministic balance scenario id(s).',
      '  --update-baseline         Regenerate retention soak digest fixture from current output.',
      '  --help                    Show this message.',
      '',
    ].join('\n'),
  )
}

function parseIntegerArg(rawValue, optionName) {
  const parsed = Number.parseInt(rawValue, 10)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`${optionName} must be an integer.`)
  }

  return parsed
}

function parseArgs(argv) {
  const options = {
    seed: returnObjectiveEconomyTuning.deterministicBalanceCheck.seed,
    soakMultiplier: DEFAULT_SOAK_MULTIPLIER,
    saveInterval: DEFAULT_SAVE_INTERVAL,
    scenarioFilter: null,
    updateBaseline: false,
  }

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg === '--update-baseline') {
      options.updateBaseline = true
      continue
    }

    if (arg.startsWith('--seed=')) {
      options.seed = parseIntegerArg(arg.slice('--seed='.length), '--seed')
      continue
    }

    if (arg.startsWith('--multiplier=')) {
      const multiplier = parseIntegerArg(arg.slice('--multiplier='.length), '--multiplier')
      if (multiplier <= 0) {
        throw new Error('--multiplier must be a positive integer.')
      }

      options.soakMultiplier = multiplier
      continue
    }

    if (arg.startsWith('--save-interval=')) {
      const saveInterval = parseIntegerArg(arg.slice('--save-interval='.length), '--save-interval')
      if (saveInterval <= 0) {
        throw new Error('--save-interval must be a positive integer.')
      }

      options.saveInterval = saveInterval
      continue
    }

    if (arg.startsWith('--scenario=')) {
      const scenarioIds = arg
        .slice('--scenario='.length)
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)

      if (scenarioIds.length === 0) {
        throw new Error('--scenario must include at least one scenario id.')
      }

      options.scenarioFilter = new Set(scenarioIds)
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function clampStreakTier(value, maxTier) {
  if (!Number.isFinite(value)) {
    return 0
  }

  const normalized = Math.floor(value)
  if (normalized <= 0) {
    return 0
  }

  return Math.min(normalized, maxTier)
}

function resolveStreakDecay(streakTier, lastClaimedAtEpochMs, nowEpochMs, streakConfig) {
  const normalizedTier = clampStreakTier(streakTier, streakConfig.maxTier)
  if (lastClaimedAtEpochMs === null || !Number.isFinite(lastClaimedAtEpochMs)) {
    return {
      effectiveTier: normalizedTier,
      missedGraceWindows: 0,
    }
  }

  const elapsedMsSinceClaim = Math.max(0, nowEpochMs - lastClaimedAtEpochMs)
  const missedGraceWindows = Math.max(0, Math.floor(elapsedMsSinceClaim / streakConfig.graceWindowMs))
  const effectiveTier = clampStreakTier(normalizedTier - missedGraceWindows, streakConfig.maxTier)

  return {
    effectiveTier,
    missedGraceWindows,
  }
}

function getTierConfigByTier(streakConfig) {
  const map = new Map()
  for (const tierConfig of streakConfig.tiers) {
    map.set(tierConfig.tier, tierConfig)
  }

  return map
}

function calculateClaimReward(baseRewardAmount, claimTier, tierConfigByTier) {
  const normalizedBaseReward =
    Number.isFinite(baseRewardAmount) && baseRewardAmount > 0 ? Math.floor(baseRewardAmount) : 0
  const tierConfig = tierConfigByTier.get(claimTier) ?? BASE_STREAK_TIER_CONFIG
  const multipliedReward = Math.floor(normalizedBaseReward * tierConfig.rewardMultiplier)
  const totalRewardAmount = Math.max(0, multipliedReward + tierConfig.rewardBonus)

  return {
    claimTier: tierConfig.tier,
    baseRewardAmount: normalizedBaseReward,
    totalRewardAmount,
    streakBonusAmount: Math.max(0, totalRewardAmount - normalizedBaseReward),
  }
}

function resolveObjectiveByCycle(objectives, seed, assignmentCycle) {
  const normalizedSeed = Number.isFinite(seed) ? Math.floor(seed) : 0
  const objectiveCount = objectives.length
  const index = ((normalizedSeed + assignmentCycle) % objectiveCount + objectiveCount) % objectiveCount
  const objective = objectives[index]
  if (!objective) {
    throw new Error(`Unable to resolve objective for assignment cycle ${assignmentCycle}.`)
  }

  return objective
}

function createDefaultReturnObjectiveState() {
  return {
    activeObjectiveId: null,
    progressValue: 0,
    assignedAtEpochMs: null,
    completedAtEpochMs: null,
    claimedAtEpochMs: null,
    assignmentCycle: 0,
  }
}

function createDefaultReturnObjectiveStreakState() {
  return {
    tier: 0,
    lastClaimedAtEpochMs: null,
  }
}

function createDefaultSaveState() {
  return {
    nowEpochMs: 0,
    currency: 0,
    returnObjective: createDefaultReturnObjectiveState(),
    returnObjectiveStreak: createDefaultReturnObjectiveStreakState(),
  }
}

function resolveEffectiveFlags(rawFlags) {
  const retentionEnhancementsEnabled = !rawFlags.retentionKillSwitchEnabled
  const objectiveLoopEnabled = retentionEnhancementsEnabled && rawFlags.objectiveLoopUiEnabled
  const streakBonusEnabled = objectiveLoopEnabled && rawFlags.streakBonusEnabled

  return {
    objectiveLoopEnabled,
    streakBonusEnabled,
    retentionKillSwitchEnabled: rawFlags.retentionKillSwitchEnabled,
  }
}

function buildRawFlagMatrix() {
  const bools = [false, true]
  const matrix = []

  for (const objectiveLoopUiEnabled of bools) {
    for (const streakBonusEnabled of bools) {
      for (const retentionKillSwitchEnabled of bools) {
        matrix.push({
          objectiveLoopUiEnabled,
          streakBonusEnabled,
          retentionKillSwitchEnabled,
        })
      }
    }
  }

  return matrix
}

function formatFlagBits(flags) {
  const objectiveEnabled = Boolean(flags.objectiveLoopUiEnabled ?? flags.objectiveLoopEnabled)
  const streakEnabled = Boolean(flags.streakBonusEnabled)
  const killSwitchEnabled = Boolean(flags.retentionKillSwitchEnabled)
  return `obj:${objectiveEnabled ? 1 : 0},streak:${streakEnabled ? 1 : 0},kill:${killSwitchEnabled ? 1 : 0}`
}

function buildCaseKey(scenarioId, rawFlags) {
  return `${scenarioId}::${rawFlags.objectiveLoopUiEnabled ? 1 : 0}${rawFlags.streakBonusEnabled ? 1 : 0}${rawFlags.retentionKillSwitchEnabled ? 1 : 0}`
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function serializeSaveState(saveState, nowEpochMs) {
  const payload = {
    schemaVersion: 1,
    metadata: {
      savedAtEpochMs: nowEpochMs,
    },
    currency: saveState.currency,
    returnObjective: deepClone(saveState.returnObjective),
    returnObjectiveStreak: deepClone(saveState.returnObjectiveStreak),
  }

  return JSON.stringify(payload)
}

function hydrateSaveState(serialized, objectivesById, streakConfig) {
  const parsed = JSON.parse(serialized)

  const hydrated = createDefaultSaveState()
  hydrated.currency =
    Number.isFinite(parsed.currency) && Math.floor(parsed.currency) >= 0 ? Math.floor(parsed.currency) : 0

  const rawObjective = parsed.returnObjective
  if (rawObjective && typeof rawObjective === 'object') {
    const activeObjectiveId =
      typeof rawObjective.activeObjectiveId === 'string' && objectivesById.has(rawObjective.activeObjectiveId)
        ? rawObjective.activeObjectiveId
        : null

    hydrated.returnObjective = {
      activeObjectiveId,
      progressValue:
        Number.isFinite(rawObjective.progressValue) && Math.floor(rawObjective.progressValue) >= 0
          ? Math.floor(rawObjective.progressValue)
          : 0,
      assignedAtEpochMs:
        Number.isFinite(rawObjective.assignedAtEpochMs) && Math.floor(rawObjective.assignedAtEpochMs) >= 0
          ? Math.floor(rawObjective.assignedAtEpochMs)
          : null,
      completedAtEpochMs:
        Number.isFinite(rawObjective.completedAtEpochMs) && Math.floor(rawObjective.completedAtEpochMs) >= 0
          ? Math.floor(rawObjective.completedAtEpochMs)
          : null,
      claimedAtEpochMs:
        Number.isFinite(rawObjective.claimedAtEpochMs) && Math.floor(rawObjective.claimedAtEpochMs) >= 0
          ? Math.floor(rawObjective.claimedAtEpochMs)
          : null,
      assignmentCycle:
        Number.isFinite(rawObjective.assignmentCycle) && Math.floor(rawObjective.assignmentCycle) >= 0
          ? Math.floor(rawObjective.assignmentCycle)
          : 0,
    }
  }

  const rawStreak = parsed.returnObjectiveStreak
  if (rawStreak && typeof rawStreak === 'object') {
    hydrated.returnObjectiveStreak = {
      tier: clampStreakTier(rawStreak.tier, streakConfig.maxTier),
      lastClaimedAtEpochMs:
        Number.isFinite(rawStreak.lastClaimedAtEpochMs) && Math.floor(rawStreak.lastClaimedAtEpochMs) >= 0
          ? Math.floor(rawStreak.lastClaimedAtEpochMs)
          : null,
    }
  }

  return hydrated
}

function ensureObjectiveAssigned(saveState, objectives, seed, nowEpochMs) {
  const objectiveState = saveState.returnObjective
  if (objectiveState.activeObjectiveId !== null && objectiveState.claimedAtEpochMs === null) {
    return
  }

  const nextObjective = resolveObjectiveByCycle(objectives, seed, objectiveState.assignmentCycle)
  saveState.returnObjective = {
    activeObjectiveId: nextObjective.id,
    progressValue: 0,
    assignedAtEpochMs: nowEpochMs,
    completedAtEpochMs: null,
    claimedAtEpochMs: null,
    assignmentCycle: objectiveState.assignmentCycle,
  }
}

function applyRuntimeDisabledState(saveState) {
  saveState.returnObjective = {
    ...saveState.returnObjective,
    activeObjectiveId: null,
    progressValue: 0,
    assignedAtEpochMs: null,
    completedAtEpochMs: null,
    claimedAtEpochMs: null,
  }
  saveState.returnObjectiveStreak = {
    tier: 0,
    lastClaimedAtEpochMs: null,
  }
}

function runSoakCase({
  scenario,
  rawFlags,
  effectiveFlags,
  options,
  objectives,
  objectivesById,
  streakConfig,
  tierConfigByTier,
}) {
  const sessionCount = scenario.sessionCount * options.soakMultiplier
  const caseKey = buildCaseKey(scenario.id, rawFlags)
  const trace = []
  const failures = []

  const stats = {
    sessionCount,
    claimCount: 0,
    saveLoadCount: 0,
    cappedSpendCount: 0,
    currencyEarned: 0,
    currencySpent: 0,
    streakBonusTotal: 0,
    finalCurrency: 0,
    finalAssignmentCycle: 0,
    finalStreakTier: 0,
  }

  const saveState = createDefaultSaveState()
  let maxCyclesWithoutClaim = 0
  let consecutiveCyclesWithoutClaim = 0

  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
    const cadenceHours =
      scenario.claimCadenceHours[sessionIndex % scenario.claimCadenceHours.length] ?? 24
    saveState.nowEpochMs += Math.floor(cadenceHours * MS_PER_HOUR)

    let sessionClaimed = false
    let objectiveIdBeforeClaim = null
    let claimRewardAmount = 0

    if (effectiveFlags.objectiveLoopEnabled) {
      ensureObjectiveAssigned(saveState, objectives, options.seed, saveState.nowEpochMs)

      const objectiveState = saveState.returnObjective
      if (objectiveState.activeObjectiveId === null) {
        failures.push(
          `${caseKey} session ${sessionIndex}: objective loop enabled but no active objective is assigned.`,
        )
      } else {
        objectiveIdBeforeClaim = objectiveState.activeObjectiveId
        const objectiveConfig = objectivesById.get(objectiveState.activeObjectiveId)
        if (!objectiveConfig) {
          failures.push(
            `${caseKey} session ${sessionIndex}: objective "${objectiveState.activeObjectiveId}" not found in config.`,
          )
        } else {
          objectiveState.progressValue = objectiveConfig.targetValue
          objectiveState.completedAtEpochMs = objectiveState.completedAtEpochMs ?? saveState.nowEpochMs

          const streakBonusEnabled = effectiveFlags.streakBonusEnabled
          let claimTier = 0
          if (streakBonusEnabled) {
            const streakDecay = resolveStreakDecay(
              saveState.returnObjectiveStreak.tier,
              saveState.returnObjectiveStreak.lastClaimedAtEpochMs,
              saveState.nowEpochMs,
              streakConfig,
            )
            claimTier = clampStreakTier(streakDecay.effectiveTier + 1, streakConfig.maxTier)
          }

          const rewardBreakdown = streakBonusEnabled
            ? calculateClaimReward(objectiveConfig.rewardAmount, claimTier, tierConfigByTier)
            : {
                claimTier: 0,
                baseRewardAmount: Math.floor(objectiveConfig.rewardAmount),
                totalRewardAmount: Math.floor(objectiveConfig.rewardAmount),
                streakBonusAmount: 0,
              }

          claimRewardAmount = rewardBreakdown.totalRewardAmount
          saveState.currency += rewardBreakdown.totalRewardAmount
          stats.currencyEarned += rewardBreakdown.totalRewardAmount
          stats.streakBonusTotal += rewardBreakdown.streakBonusAmount

          objectiveState.claimedAtEpochMs = saveState.nowEpochMs
          objectiveState.assignmentCycle += 1

          if (streakBonusEnabled) {
            saveState.returnObjectiveStreak = {
              tier: rewardBreakdown.claimTier,
              lastClaimedAtEpochMs: saveState.nowEpochMs,
            }
          } else {
            saveState.returnObjectiveStreak = {
              tier: 0,
              lastClaimedAtEpochMs: null,
            }
          }

          ensureObjectiveAssigned(saveState, objectives, options.seed, saveState.nowEpochMs)
          sessionClaimed = true
          stats.claimCount += 1
        }
      }
    } else {
      applyRuntimeDisabledState(saveState)
      if (saveState.returnObjective.activeObjectiveId !== null) {
        failures.push(
          `${caseKey} session ${sessionIndex}: objective loop disabled but active objective is still set.`,
        )
      }
    }

    if (!sessionClaimed && effectiveFlags.objectiveLoopEnabled) {
      consecutiveCyclesWithoutClaim += 1
      maxCyclesWithoutClaim = Math.max(maxCyclesWithoutClaim, consecutiveCyclesWithoutClaim)
      failures.push(
        `${caseKey} session ${sessionIndex}: objective loop made no claim (potential stuck objective state).`,
      )
    } else {
      consecutiveCyclesWithoutClaim = 0
    }

    const plannedSpend =
      scenario.spendAmountsBySessionCycle[sessionIndex % scenario.spendAmountsBySessionCycle.length] ?? 0
    const spendAmount = Math.min(plannedSpend, saveState.currency)
    if (spendAmount < plannedSpend) {
      stats.cappedSpendCount += 1
    }
    saveState.currency -= spendAmount
    stats.currencySpent += spendAmount

    if (saveState.currency < 0) {
      failures.push(
        `${caseKey} session ${sessionIndex}: currency dropped below zero (${saveState.currency}).`,
      )
    }

    const shouldRoundTrip =
      (sessionIndex + 1) % options.saveInterval === 0 || sessionIndex === sessionCount - 1

    if (shouldRoundTrip) {
      const currencyBeforeRoundTrip = saveState.currency
      const assignmentCycleBeforeRoundTrip = saveState.returnObjective.assignmentCycle
      const serialized = serializeSaveState(saveState, saveState.nowEpochMs)
      const hydrated = hydrateSaveState(serialized, objectivesById, streakConfig)

      if (hydrated.currency < currencyBeforeRoundTrip) {
        failures.push(
          `${caseKey} session ${sessionIndex}: negative currency drift across save/load (${currencyBeforeRoundTrip} -> ${hydrated.currency}).`,
        )
      }

      if (hydrated.currency !== currencyBeforeRoundTrip) {
        failures.push(
          `${caseKey} session ${sessionIndex}: currency mismatch across save/load (${currencyBeforeRoundTrip} -> ${hydrated.currency}).`,
        )
      }

      if (hydrated.returnObjective.assignmentCycle !== assignmentCycleBeforeRoundTrip) {
        failures.push(
          `${caseKey} session ${sessionIndex}: assignment cycle drift across save/load (${assignmentCycleBeforeRoundTrip} -> ${hydrated.returnObjective.assignmentCycle}).`,
        )
      }

      saveState.currency = hydrated.currency
      saveState.returnObjective = hydrated.returnObjective
      saveState.returnObjectiveStreak = hydrated.returnObjectiveStreak
      stats.saveLoadCount += 1
    }

    trace.push(
      [
        scenario.id,
        sessionIndex,
        saveState.nowEpochMs,
        objectiveIdBeforeClaim ?? 'none',
        claimRewardAmount,
        spendAmount,
        saveState.currency,
        saveState.returnObjective.assignmentCycle,
        saveState.returnObjective.activeObjectiveId ?? 'none',
        saveState.returnObjectiveStreak.tier,
      ].join(':'),
    )
  }

  stats.finalCurrency = saveState.currency
  stats.finalAssignmentCycle = saveState.returnObjective.assignmentCycle
  stats.finalStreakTier = saveState.returnObjectiveStreak.tier

  if (effectiveFlags.objectiveLoopEnabled && maxCyclesWithoutClaim > 0) {
    failures.push(`${caseKey}: max consecutive no-claim cycles = ${maxCyclesWithoutClaim}.`)
  }

  const digest = crypto.createHash('sha256').update(trace.join('\n')).digest('hex')

  return {
    caseKey,
    scenarioId: scenario.id,
    rawFlags,
    effectiveFlags,
    digest,
    stats,
    failures,
  }
}

function loadBaselineFixture() {
  const raw = fs.readFileSync(BASELINE_FIXTURE_PATH, 'utf8')
  return JSON.parse(raw)
}

function buildBaselineFixture(results, options) {
  const matrix = results
    .map((result) => ({
      caseKey: result.caseKey,
      scenarioId: result.scenarioId,
      rawFlags: result.rawFlags,
      effectiveFlags: result.effectiveFlags,
      digest: result.digest,
      stats: result.stats,
    }))
    .sort((left, right) => left.caseKey.localeCompare(right.caseKey))

  return {
    seed: options.seed,
    soakMultiplier: options.soakMultiplier,
    saveInterval: options.saveInterval,
    generatedAt: new Date().toISOString(),
    matrix,
  }
}

function compareAgainstBaseline(results, baselineFixture, options) {
  const failures = []
  const caseFailureMap = new Map()

  if (baselineFixture.seed !== options.seed) {
    failures.push(
      `Baseline seed mismatch: fixture=${baselineFixture.seed}, run=${options.seed}. Re-run with --update-baseline if intentional.`,
    )
  }

  if (baselineFixture.soakMultiplier !== options.soakMultiplier) {
    failures.push(
      `Baseline multiplier mismatch: fixture=${baselineFixture.soakMultiplier}, run=${options.soakMultiplier}. Re-run with --update-baseline if intentional.`,
    )
  }

  if (baselineFixture.saveInterval !== options.saveInterval) {
    failures.push(
      `Baseline save interval mismatch: fixture=${baselineFixture.saveInterval}, run=${options.saveInterval}. Re-run with --update-baseline if intentional.`,
    )
  }

  const expectedByCaseKey = new Map(
    (baselineFixture.matrix ?? []).map((entry) => [entry.caseKey, entry]),
  )

  for (const result of results) {
    const expected = expectedByCaseKey.get(result.caseKey)
    if (!expected) {
      const message = `${result.caseKey}: missing baseline digest entry.`
      failures.push(message)
      caseFailureMap.set(result.caseKey, [message])
      continue
    }

    if (expected.digest !== result.digest) {
      const message = `${result.caseKey}: replay drift detected (expected ${expected.digest.slice(0, 12)}, actual ${result.digest.slice(0, 12)}).`
      failures.push(message)
      caseFailureMap.set(result.caseKey, [message])
    }
  }

  return {
    failures,
    caseFailureMap,
  }
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const tuning = returnObjectiveEconomyTuning
  const objectives = tuning.objectives
  const streakConfig = tuning.streak

  if (objectives.length === 0) {
    throw new Error('No return objectives are configured.')
  }

  const scenarios = tuning.deterministicBalanceCheck.scenarios.filter((scenario) =>
    options.scenarioFilter === null ? true : options.scenarioFilter.has(scenario.id),
  )
  if (scenarios.length === 0) {
    throw new Error('No scenarios selected. Check --scenario values.')
  }

  const objectivesById = new Map(objectives.map((objective) => [objective.id, objective]))
  const tierConfigByTier = getTierConfigByTier(streakConfig)
  const rawFlagMatrix = buildRawFlagMatrix()

  const results = []
  const caseProblems = new Map()
  const globalFailures = []

  for (const scenario of scenarios) {
    for (const rawFlags of rawFlagMatrix) {
      const effectiveFlags = resolveEffectiveFlags(rawFlags)

      const firstRun = runSoakCase({
        scenario,
        rawFlags,
        effectiveFlags,
        options,
        objectives,
        objectivesById,
        streakConfig,
        tierConfigByTier,
      })

      const replayRun = runSoakCase({
        scenario,
        rawFlags,
        effectiveFlags,
        options,
        objectives,
        objectivesById,
        streakConfig,
        tierConfigByTier,
      })

      const replayFailures = []
      if (firstRun.digest !== replayRun.digest) {
        replayFailures.push(
          `${firstRun.caseKey}: non-deterministic output on same-seed replay (${firstRun.digest.slice(0, 12)} != ${replayRun.digest.slice(0, 12)}).`,
        )
      }

      const failureMessages = [...firstRun.failures, ...replayFailures]
      if (failureMessages.length > 0) {
        caseProblems.set(firstRun.caseKey, failureMessages)
        globalFailures.push(...failureMessages)
      }

      results.push(firstRun)
    }
  }

  if (options.updateBaseline) {
    if (globalFailures.length > 0) {
      throw new Error(
        `Cannot update baseline because soak invariants failed:\n${globalFailures
          .map((message) => `- ${message}`)
          .join('\n')}`,
      )
    }

    const baselineFixture = buildBaselineFixture(results, options)
    fs.mkdirSync(path.dirname(BASELINE_FIXTURE_PATH), { recursive: true })
    fs.writeFileSync(BASELINE_FIXTURE_PATH, `${JSON.stringify(baselineFixture, null, 2)}\n`, 'utf8')

    process.stdout.write(
      `Updated retention soak baseline fixture at ${path.relative(process.cwd(), BASELINE_FIXTURE_PATH)}.\n`,
    )
    return
  }

  const baselineFixture = loadBaselineFixture()
  const baselineComparison = compareAgainstBaseline(results, baselineFixture, options)
  if (baselineComparison.failures.length > 0) {
    for (const message of baselineComparison.failures) {
      globalFailures.push(message)
    }
    for (const [caseKey, messages] of baselineComparison.caseFailureMap.entries()) {
      const existingMessages = caseProblems.get(caseKey) ?? []
      caseProblems.set(caseKey, [...existingMessages, ...messages])
    }
  }

  const reportLines = [
    '# Tiny Ranch Retention Soak Check',
    '',
    '## Inputs',
    '',
    `- Seed: ${options.seed}`,
    `- Scenario count: ${scenarios.length}`,
    `- Session multiplier: ${options.soakMultiplier}`,
    `- Save/load interval: every ${options.saveInterval} sessions`,
    `- Baseline fixture: ${path.relative(process.cwd(), BASELINE_FIXTURE_PATH)}`,
    '',
    '## Matrix Results',
    '',
    '| Scenario | Raw flags | Effective flags | Sessions | Claims | Save/Load | Final currency | Digest | Status |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
  ]

  for (const result of results) {
    const status = caseProblems.has(result.caseKey) ? 'FAIL' : 'PASS'
    reportLines.push(
      `| ${result.scenarioId} | ${formatFlagBits(result.rawFlags)} | ${formatFlagBits(result.effectiveFlags)} | ${result.stats.sessionCount} | ${result.stats.claimCount} | ${result.stats.saveLoadCount} | ${result.stats.finalCurrency} | ${result.digest.slice(0, 12)} | ${status} |`,
    )
  }

  process.stdout.write(`${reportLines.join('\n')}\n`)

  if (globalFailures.length > 0) {
    const uniqueFailures = [...new Set(globalFailures)]
    process.stderr.write(
      `\nRetention soak validation failed:\n${uniqueFailures
        .map((message) => `- ${message}`)
        .join('\n')}\n`,
    )
    process.exitCode = 1
  }
}

try {
  run()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
