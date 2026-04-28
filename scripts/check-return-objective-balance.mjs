#!/usr/bin/env node

import { barnProcessingRecipeDefinitions } from '../src/game/config/barnRecipes.shared.js'
import { expansionEconomyTuning } from '../src/game/config/expansionEconomyTuning.shared.js'
import { returnObjectiveEconomyTuning } from '../src/game/config/returnObjectiveEconomyTuning.shared.js'

const BASE_STREAK_TIER_CONFIG = Object.freeze({
  tier: 0,
  rewardMultiplier: 1,
  rewardBonus: 0,
})
const DEFAULT_ITEM_SELL_PRICE = 4
const MS_PER_HOUR = 60 * 60 * 1000

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/check-return-objective-balance.mjs [options]',
      '',
      'Options:',
      '  --seed=<number>       Deterministic objective assignment seed override.',
      '  --sessions=<number>   Override scenario sessionCount for all scenarios.',
      '  --scenario=<id[,id]>  Run only selected scenario id(s).',
      '  --help                Show this message.',
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
    sessionCountOverride: null,
    scenarioFilter: null,
  }

  for (const arg of argv) {
    if (arg === '--') {
      continue
    }

    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }

    if (arg.startsWith('--seed=')) {
      options.seed = parseIntegerArg(arg.slice('--seed='.length), '--seed')
      continue
    }

    if (arg.startsWith('--sessions=')) {
      const sessionCount = parseIntegerArg(arg.slice('--sessions='.length), '--sessions')
      if (sessionCount <= 0) {
        throw new Error('--sessions must be a positive integer.')
      }

      options.sessionCountOverride = sessionCount
      continue
    }

    if (arg.startsWith('--scenario=')) {
      const ids = arg
        .slice('--scenario='.length)
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
      if (ids.length === 0) {
        throw new Error('--scenario must include at least one scenario id.')
      }

      options.scenarioFilter = new Set(ids)
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

function resolveStreakDecay(streakTier, lastClaimedAtEpochMs, nowEpochMs, graceWindowMs, maxTier) {
  const normalizedTier = clampStreakTier(streakTier, maxTier)
  if (!Number.isFinite(lastClaimedAtEpochMs) || lastClaimedAtEpochMs === null) {
    return {
      effectiveTier: normalizedTier,
      missedGraceWindows: 0,
    }
  }

  const elapsedMsSinceClaim = Math.max(0, nowEpochMs - lastClaimedAtEpochMs)
  const missedGraceWindows = Math.max(0, Math.floor(elapsedMsSinceClaim / graceWindowMs))
  const effectiveTier = clampStreakTier(normalizedTier - missedGraceWindows, maxTier)
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

function calculateClaimReward(baseRewardAmount, streakTier, tierConfigByTier) {
  const normalizedBaseReward =
    Number.isFinite(baseRewardAmount) && baseRewardAmount > 0 ? Math.floor(baseRewardAmount) : 0
  const tierConfig = tierConfigByTier.get(streakTier) ?? BASE_STREAK_TIER_CONFIG
  const multipliedReward = Math.floor(normalizedBaseReward * tierConfig.rewardMultiplier)
  const totalRewardAmount = Math.max(0, multipliedReward + tierConfig.rewardBonus)
  const streakBonusAmount = Math.max(0, totalRewardAmount - normalizedBaseReward)

  return {
    baseRewardAmount: normalizedBaseReward,
    totalRewardAmount,
    streakBonusAmount,
  }
}

function getItemSellUnitPrice(itemId) {
  const normalizedItemId =
    typeof itemId === 'string' ? itemId.trim().toLowerCase() : ''
  if (normalizedItemId.length === 0) {
    throw new Error('Item id is required to resolve sell value.')
  }

  return expansionEconomyTuning.itemSellUnitPrices[normalizedItemId] ?? DEFAULT_ITEM_SELL_PRICE
}

function calculateLineItemSellValue(lineItems) {
  return lineItems.reduce((total, item) => total + getItemSellUnitPrice(item.itemId) * item.quantity, 0)
}

function calculateBarnNetValueEarned(objective) {
  if (objective.metric !== 'barn_claim_count') {
    return 0
  }

  if (typeof objective.barnRecipeId !== 'string' || objective.barnRecipeId.trim().length === 0) {
    throw new Error(`Barn claim objective "${objective.id}" is missing barnRecipeId.`)
  }

  const recipe = barnProcessingRecipeDefinitions[objective.barnRecipeId]
  if (!recipe) {
    throw new Error(
      `Barn claim objective "${objective.id}" references unknown recipe "${objective.barnRecipeId}".`,
    )
  }

  return (
    calculateLineItemSellValue(recipe.outputs) -
    calculateLineItemSellValue(recipe.inputs) -
    recipe.fee
  )
}

function calculateDeltaPct(currentValue, baselineValue) {
  if (!Number.isFinite(baselineValue) || baselineValue === 0) {
    return currentValue === baselineValue ? 0 : Number.POSITIVE_INFINITY
  }

  return ((currentValue - baselineValue) / Math.abs(baselineValue)) * 100
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return 'n/a'
  }

  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function validateScenarioConfig(scenario, streakConfig) {
  if (typeof scenario.id !== 'string' || scenario.id.trim().length === 0) {
    throw new Error('Scenario id is required.')
  }

  if (!Number.isFinite(scenario.sessionCount) || Math.floor(scenario.sessionCount) !== scenario.sessionCount) {
    throw new Error(`Scenario "${scenario.id}" sessionCount must be an integer.`)
  }

  if (scenario.sessionCount <= 0) {
    throw new Error(`Scenario "${scenario.id}" sessionCount must be greater than zero.`)
  }

  if (!Array.isArray(scenario.claimCadenceHours) || scenario.claimCadenceHours.length === 0) {
    throw new Error(`Scenario "${scenario.id}" must define claimCadenceHours.`)
  }

  scenario.claimCadenceHours.forEach((hours, index) => {
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error(
        `Scenario "${scenario.id}" claimCadenceHours[${index}] must be a positive number.`,
      )
    }
  })

  if (
    !Array.isArray(scenario.spendAmountsBySessionCycle) ||
    scenario.spendAmountsBySessionCycle.length === 0
  ) {
    throw new Error(`Scenario "${scenario.id}" must define spendAmountsBySessionCycle.`)
  }

  scenario.spendAmountsBySessionCycle.forEach((amount, index) => {
    if (!Number.isFinite(amount) || Math.floor(amount) !== amount || amount < 0) {
      throw new Error(
        `Scenario "${scenario.id}" spendAmountsBySessionCycle[${index}] must be a non-negative integer.`,
      )
    }
  })

  if (
    !Number.isFinite(scenario.baseline.currencyEarned) ||
    Math.floor(scenario.baseline.currencyEarned) !== scenario.baseline.currencyEarned ||
    scenario.baseline.currencyEarned <= 0
  ) {
    throw new Error(`Scenario "${scenario.id}" baseline.currencyEarned must be a positive integer.`)
  }

  if (
    !Number.isFinite(scenario.baseline.currencySpent) ||
    Math.floor(scenario.baseline.currencySpent) !== scenario.baseline.currencySpent ||
    scenario.baseline.currencySpent < 0
  ) {
    throw new Error(`Scenario "${scenario.id}" baseline.currencySpent must be a non-negative integer.`)
  }

  if (
    !Number.isFinite(scenario.baseline.streakBonusTotal) ||
    Math.floor(scenario.baseline.streakBonusTotal) !== scenario.baseline.streakBonusTotal ||
    scenario.baseline.streakBonusTotal < 0
  ) {
    throw new Error(`Scenario "${scenario.id}" baseline.streakBonusTotal must be a non-negative integer.`)
  }

  if (
    !Number.isFinite(scenario.baseline.barnNetValueEarned) ||
    Math.floor(scenario.baseline.barnNetValueEarned) !== scenario.baseline.barnNetValueEarned ||
    scenario.baseline.barnNetValueEarned < 0
  ) {
    throw new Error(
      `Scenario "${scenario.id}" baseline.barnNetValueEarned must be a non-negative integer.`,
    )
  }

  if (!Number.isFinite(streakConfig.graceWindowMs) || streakConfig.graceWindowMs <= 0) {
    throw new Error('streak.graceWindowMs must be a positive number.')
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

function evaluateScenario(scenario, options, objectives, streakConfig, guardrails, tierConfigByTier) {
  validateScenarioConfig(scenario, streakConfig)

  const sessionCount = options.sessionCountOverride ?? scenario.sessionCount
  if (sessionCount <= 0) {
    throw new Error(`Scenario "${scenario.id}" resolved to an invalid session count.`)
  }

  let nowEpochMs = 0
  let assignmentCycle = 0
  let streakTier = 0
  let lastClaimedAtEpochMs = null
  let currencyEarned = 0
  let currencySpent = 0
  let streakBonusTotal = 0
  let baseRewardTotal = 0
  let barnNetValueEarned = 0

  const objectiveClaimCounts = {}
  objectives.forEach((objective) => {
    objectiveClaimCounts[objective.id] = 0
  })

  for (let sessionIndex = 0; sessionIndex < sessionCount; sessionIndex += 1) {
    const cadenceHours =
      scenario.claimCadenceHours[sessionIndex % scenario.claimCadenceHours.length] ?? 24
    nowEpochMs += Math.floor(cadenceHours * MS_PER_HOUR)

    const objective = resolveObjectiveByCycle(objectives, options.seed, assignmentCycle)
    const streakDecay = resolveStreakDecay(
      streakTier,
      lastClaimedAtEpochMs,
      nowEpochMs,
      streakConfig.graceWindowMs,
      streakConfig.maxTier,
    )
    const claimTier = clampStreakTier(streakDecay.effectiveTier + 1, streakConfig.maxTier)
    const reward = calculateClaimReward(objective.rewardAmount, claimTier, tierConfigByTier)

    currencyEarned += reward.totalRewardAmount
    streakBonusTotal += reward.streakBonusAmount
    baseRewardTotal += reward.baseRewardAmount
    barnNetValueEarned += calculateBarnNetValueEarned(objective)
    objectiveClaimCounts[objective.id] += 1

    assignmentCycle += 1
    streakTier = claimTier
    lastClaimedAtEpochMs = nowEpochMs

    const spendAmount =
      scenario.spendAmountsBySessionCycle[sessionIndex % scenario.spendAmountsBySessionCycle.length] ?? 0
    currencySpent += spendAmount
  }

  const totalEarned = currencyEarned + barnNetValueEarned
  const baselineTotalEarned =
    scenario.baseline.currencyEarned + scenario.baseline.barnNetValueEarned
  const netCurrency = totalEarned - currencySpent
  const baselineNetCurrency = baselineTotalEarned - scenario.baseline.currencySpent
  const rewardInflationDeltaPct = calculateDeltaPct(totalEarned, baselineTotalEarned)
  const netInflationDeltaPct = calculateDeltaPct(netCurrency, baselineNetCurrency)
  const streakBonusSharePct = totalEarned > 0 ? (streakBonusTotal / totalEarned) * 100 : 0

  const failures = []
  if (rewardInflationDeltaPct > guardrails.maxRewardInflationDeltaPct) {
    failures.push(
      `Reward inflation ${formatPercent(rewardInflationDeltaPct)} exceeds +${guardrails.maxRewardInflationDeltaPct.toFixed(2)}%.`,
    )
  }

  if (netInflationDeltaPct > guardrails.maxNetInflationDeltaPct) {
    failures.push(
      `Net inflation ${formatPercent(netInflationDeltaPct)} exceeds +${guardrails.maxNetInflationDeltaPct.toFixed(2)}%.`,
    )
  }

  if (streakBonusSharePct > guardrails.maxStreakBonusSharePct) {
    failures.push(
      `Streak bonus share ${streakBonusSharePct.toFixed(2)}% exceeds ${guardrails.maxStreakBonusSharePct.toFixed(2)}%.`,
    )
  }

  return {
    scenario,
    sessionCount,
    totalEarned,
    currencyEarned,
    currencySpent,
    netCurrency,
    baseRewardTotal,
    barnNetValueEarned,
    streakBonusTotal,
    streakBonusSharePct,
    rewardInflationDeltaPct,
    netInflationDeltaPct,
    objectiveClaimCounts,
    failures,
  }
}

function formatScenarioList(scenarios) {
  return scenarios.map((scenario) => scenario.id).join(', ')
}

function run() {
  const options = parseArgs(process.argv.slice(2))
  const balanceCheckConfig = returnObjectiveEconomyTuning.deterministicBalanceCheck
  const objectives = returnObjectiveEconomyTuning.objectives
  const streakConfig = returnObjectiveEconomyTuning.streak
  const guardrails = balanceCheckConfig.guardrails

  if (objectives.length === 0) {
    throw new Error('At least one objective must be configured.')
  }

  if (!Number.isFinite(streakConfig.maxTier) || Math.floor(streakConfig.maxTier) !== streakConfig.maxTier) {
    throw new Error('streak.maxTier must be an integer.')
  }

  if (streakConfig.maxTier <= 0) {
    throw new Error('streak.maxTier must be greater than zero.')
  }

  if (!Array.isArray(streakConfig.tiers) || streakConfig.tiers.length === 0) {
    throw new Error('streak.tiers must include at least one tier.')
  }

  if (
    !Number.isFinite(guardrails.maxRewardInflationDeltaPct) ||
    !Number.isFinite(guardrails.maxNetInflationDeltaPct) ||
    !Number.isFinite(guardrails.maxStreakBonusSharePct)
  ) {
    throw new Error('All guardrail thresholds must be finite numbers.')
  }

  const scenarios = balanceCheckConfig.scenarios.filter((scenario) =>
    options.scenarioFilter === null ? true : options.scenarioFilter.has(scenario.id),
  )

  if (scenarios.length === 0) {
    throw new Error('No scenarios selected. Check --scenario values.')
  }

  const tierConfigByTier = getTierConfigByTier(streakConfig)
  const results = scenarios.map((scenario) =>
    evaluateScenario(scenario, options, objectives, streakConfig, guardrails, tierConfigByTier),
  )

  const report = [
    '# Tiny Ranch Return Objective Economy Check',
    '',
    '## Config Surface',
    '',
    '- `src/game/config/returnObjectiveEconomyTuning.shared.js`',
    '- `src/game/config/barnRecipes.shared.js`',
    '- `src/game/config/expansionEconomyTuning.shared.js`',
    '- `scripts/check-return-objective-balance.mjs`',
    '',
    '## Simulation Inputs',
    '',
    `- Seed: ${options.seed}`,
    `- Scenario count: ${results.length}`,
    `- Scenarios: ${formatScenarioList(scenarios)}`,
    `- Session override: ${options.sessionCountOverride ?? 'none'}`,
    '',
    '## Scenario Results',
    '',
    '| Scenario | Sessions | Earned | Spent | Net | Streak bonus | Bonus share | Reward delta vs baseline | Net delta vs baseline | Status |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    ...results.map((result) => {
      const status = result.failures.length === 0 ? 'PASS' : 'FAIL'
      return `| ${result.scenario.id} | ${result.sessionCount} | ${result.totalEarned} | ${result.currencySpent} | ${result.netCurrency} | ${result.streakBonusTotal} | ${result.streakBonusSharePct.toFixed(2)}% | ${formatPercent(result.rewardInflationDeltaPct)} | ${formatPercent(result.netInflationDeltaPct)} | ${status} |`
    }),
    '',
    '## Guardrails',
    '',
    `- Reward inflation delta <= +${guardrails.maxRewardInflationDeltaPct.toFixed(2)}%`,
    `- Net inflation delta <= +${guardrails.maxNetInflationDeltaPct.toFixed(2)}%`,
    `- Streak bonus share <= ${guardrails.maxStreakBonusSharePct.toFixed(2)}%`,
  ]

  results.forEach((result) => {
    const objectiveMix = objectives
      .map((objective) => `${objective.id}:${result.objectiveClaimCounts[objective.id]}`)
      .join(', ')
    report.push(`- ${result.scenario.id} objective mix: ${objectiveMix}`)
    report.push(
      `- ${result.scenario.id} claim coins: ${result.currencyEarned}, Barn net value: ${result.barnNetValueEarned}`,
    )
  })

  process.stdout.write(`${report.join('\n')}\n`)

  const failures = results.flatMap((result) =>
    result.failures.map((failure) => `- [${result.scenario.id}] ${failure}`),
  )
  if (failures.length > 0) {
    process.stderr.write(`\nReturn objective balance guardrails failed:\n${failures.join('\n')}\n`)
    process.exitCode = 1
  }
}

try {
  run()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
