const returnObjectiveEconomyTuning = Object.freeze({
  objectives: Object.freeze([
    Object.freeze({
      id: 'harvest_turnips_4',
      goalId: 'harvest_count_goal',
      title: 'Harvest 4 crops',
      metric: 'harvest_count',
      targetValue: 4,
      rewardAmount: 32,
    }),
    Object.freeze({
      id: 'sell_value_56',
      goalId: 'sell_value_goal',
      title: 'Sell goods worth 56 coins',
      metric: 'sell_value',
      targetValue: 56,
      rewardAmount: 40,
    }),
  ]),
  streak: Object.freeze({
    maxTier: 5,
    graceWindowMs: 24 * 60 * 60 * 1000,
    tiers: Object.freeze([
      Object.freeze({ tier: 1, rewardMultiplier: 1, rewardBonus: 0 }),
      Object.freeze({ tier: 2, rewardMultiplier: 1.1, rewardBonus: 2 }),
      Object.freeze({ tier: 3, rewardMultiplier: 1.2, rewardBonus: 4 }),
      Object.freeze({ tier: 4, rewardMultiplier: 1.35, rewardBonus: 8 }),
      Object.freeze({ tier: 5, rewardMultiplier: 1.5, rewardBonus: 12 }),
    ]),
  }),
  deterministicBalanceCheck: Object.freeze({
    seed: 691,
    scenarios: Object.freeze([
      Object.freeze({
        id: 'daily_claim_streak',
        label: 'Daily claim cadence inside grace window',
        sessionCount: 28,
        claimCadenceHours: Object.freeze([20, 22, 19, 21]),
        spendAmountsBySessionCycle: Object.freeze([0, 18, 0, 12]),
        baseline: Object.freeze({
          currencyEarned: 1764,
          currencySpent: 210,
          streakBonusTotal: 756,
        }),
      }),
      Object.freeze({
        id: 'lapse_recovery_streak',
        label: 'Lapse-and-recovery cadence with streak decay',
        sessionCount: 28,
        claimCadenceHours: Object.freeze([20, 20, 52, 20, 44]),
        spendAmountsBySessionCycle: Object.freeze([0, 14, 0, 0, 22]),
        baseline: Object.freeze({
          currencyEarned: 1609,
          currencySpent: 194,
          streakBonusTotal: 601,
        }),
      }),
    ]),
    guardrails: Object.freeze({
      maxRewardInflationDeltaPct: 12,
      maxNetInflationDeltaPct: 15,
      maxStreakBonusSharePct: 45,
    }),
  }),
})

export { returnObjectiveEconomyTuning }
