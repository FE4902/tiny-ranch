#!/usr/bin/env node

import { expansionEconomyTuning } from '../src/game/config/expansionEconomyTuning.shared.js'

const formatMinutes = (minutes) => Number(minutes.toFixed(2))

const formatRange = (range) => `${range.min}m-${range.max}m`

const formatBundle = (bundle) =>
  Object.entries(bundle)
    .map(([itemId, quantity]) => `${quantity}x ${itemId}`)
    .join(', ')

const getTierConfig = (tier) => {
  const config = expansionEconomyTuning.expansionTiers.find((entry) => entry.tier === tier)
  if (!config) {
    throw new Error(`Missing expansion tier config for tier ${tier}.`)
  }

  return config
}

const getBundleRevenue = (saleBundle, sellMultiplier) => {
  let rawRevenue = 0
  for (const [itemId, quantity] of Object.entries(saleBundle)) {
    const unitPrice = expansionEconomyTuning.itemSellUnitPrices[itemId]
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error(`Missing or invalid sell price for item "${itemId}".`)
    }

    if (!Number.isFinite(quantity) || Math.floor(quantity) !== quantity || quantity < 0) {
      throw new Error(`Sale bundle quantity for "${itemId}" must be a non-negative integer.`)
    }

    rawRevenue += unitPrice * quantity
  }

  return Math.max(0, Math.round(rawRevenue * sellMultiplier))
}

const evaluateTarget = (minutes, range) => minutes >= range.min && minutes <= range.max

const run = () => {
  const tierTwo = getTierConfig(2)
  const tierThree = getTierConfig(3)
  const targets = expansionEconomyTuning.pacingTargetsMinutes
  const deterministicConfig = expansionEconomyTuning.deterministicBalanceCheck
  const marketLedgerLevelOne = expansionEconomyTuning.upgrades.market_ledger.levels[0]

  if (!marketLedgerLevelOne) {
    throw new Error('Market Ledger requires at least one configured level for pacing checks.')
  }

  const marketLedgerSellMultiplier = marketLedgerLevelOne.sellPriceMultiplier ?? 1
  if (!Number.isFinite(marketLedgerSellMultiplier) || marketLedgerSellMultiplier <= 0) {
    throw new Error('Market Ledger level 1 sellPriceMultiplier must be a positive number.')
  }

  let elapsedSeconds = 0
  let coins = 0
  let sellMultiplier = 1
  let marketLedgerPurchased = false

  while (coins < tierTwo.cost) {
    coins += getBundleRevenue(deterministicConfig.firstExpansion.saleBundle, sellMultiplier)
    elapsedSeconds += deterministicConfig.firstExpansion.loopDurationSeconds
  }
  coins -= tierTwo.cost
  const firstExpansionMinutes = elapsedSeconds / 60

  if (deterministicConfig.buyMarketLedgerLevel1BeforeSecondExpansion) {
    while (coins < marketLedgerLevelOne.cost) {
      coins += getBundleRevenue(deterministicConfig.secondExpansion.saleBundle, sellMultiplier)
      elapsedSeconds += deterministicConfig.secondExpansion.loopDurationSeconds
    }

    coins -= marketLedgerLevelOne.cost
    sellMultiplier *= marketLedgerSellMultiplier
    marketLedgerPurchased = true
  }

  while (coins < tierThree.cost) {
    coins += getBundleRevenue(deterministicConfig.secondExpansion.saleBundle, sellMultiplier)
    elapsedSeconds += deterministicConfig.secondExpansion.loopDurationSeconds
  }
  coins -= tierThree.cost
  const secondExpansionMinutes = elapsedSeconds / 60

  const firstTargetPass = evaluateTarget(firstExpansionMinutes, targets.firstExpansion)
  const secondTargetPass = evaluateTarget(secondExpansionMinutes, targets.secondExpansion)

  const report = [
    '# Tiny Ranch Expansion Pacing Check',
    '',
    '## Config Surface',
    '',
    '- `src/game/config/expansionEconomyTuning.shared.js`',
    '',
    '## Simulation Inputs',
    '',
    `- Tier 2 cost: ${tierTwo.cost} coins`,
    `- Tier 3 cost: ${tierThree.cost} coins`,
    `- First checkpoint loop: ${deterministicConfig.firstExpansion.loopDurationSeconds}s (${formatBundle(deterministicConfig.firstExpansion.saleBundle)})`,
    `- Second checkpoint loop: ${deterministicConfig.secondExpansion.loopDurationSeconds}s (${formatBundle(deterministicConfig.secondExpansion.saleBundle)})`,
    `- Market Ledger L1 purchase before second checkpoint: ${marketLedgerPurchased ? `yes (cost ${marketLedgerLevelOne.cost}, x${marketLedgerSellMultiplier})` : 'no'}`,
    '',
    '## Checkpoint Results',
    '',
    '| Checkpoint | Result (minutes) | Target (minutes) | Status |',
    '| --- | ---: | ---: | --- |',
    `| Tier 2 purchase | ${formatMinutes(firstExpansionMinutes)} | ${formatRange(targets.firstExpansion)} | ${firstTargetPass ? 'PASS' : 'FAIL'} |`,
    `| Tier 3 purchase | ${formatMinutes(secondExpansionMinutes)} | ${formatRange(targets.secondExpansion)} | ${secondTargetPass ? 'PASS' : 'FAIL'} |`,
  ]

  process.stdout.write(`${report.join('\n')}\n`)

  if (!firstTargetPass || !secondTargetPass) {
    process.stderr.write('Expansion pacing targets are out of range.\n')
    process.exitCode = 1
  }
}

try {
  run()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
