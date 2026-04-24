const expansionEconomyTuning = Object.freeze({
  expansionTiers: Object.freeze([
    Object.freeze({
      tier: 1,
      cost: 0,
      label: 'Starter Homestead',
      summary: 'Foundational plot with basic crop operations and shipping.',
      cropTileCapacity: 35,
      animalSlotCapacity: 2,
      unlockedZoneIds: Object.freeze(['crop_area', 'shipping_crate']),
    }),
    Object.freeze({
      tier: 2,
      cost: 210,
      label: 'Market Expansion',
      summary: 'Unlocks broader operations and stronger economy throughput.',
      cropTileCapacity: 50,
      animalSlotCapacity: 4,
      unlockedZoneIds: Object.freeze(['market_stall', 'utility_well']),
    }),
    Object.freeze({
      tier: 3,
      cost: 500,
      label: 'Full Ranch Grounds',
      summary: 'Unlocks full ranch footprint for advanced crop and animal loops.',
      cropTileCapacity: 72,
      animalSlotCapacity: 6,
      unlockedZoneIds: Object.freeze(['animal_pen', 'barn_entry']),
    }),
  ]),
  itemSellUnitPrices: Object.freeze({
    turnip: 14,
    egg: 18,
    milk: 28,
    wool: 34,
    cheese: 60,
    animal_feed: 52,
    yarn: 78,
  }),
  upgrades: Object.freeze({
    greenhouse_tools: Object.freeze({
      label: 'Greenhouse Tools',
      description: 'Improve irrigation and timing to accelerate crop growth.',
      levels: Object.freeze([
        Object.freeze({
          cost: 45,
          summary: 'Crops grow 12% faster',
          cropGrowthDurationMultiplier: 0.88,
        }),
        Object.freeze({
          cost: 120,
          summary: 'Crops grow 24% faster',
          cropGrowthDurationMultiplier: 0.76,
        }),
        Object.freeze({
          cost: 260,
          summary: 'Crops grow 35% faster',
          cropGrowthDurationMultiplier: 0.65,
        }),
      ]),
    }),
    market_ledger: Object.freeze({
      label: 'Market Ledger',
      description: 'Improve pricing strategy to increase sell revenue.',
      levels: Object.freeze([
        Object.freeze({
          cost: 70,
          summary: 'Sell value +12%',
          sellPriceMultiplier: 1.12,
        }),
        Object.freeze({
          cost: 175,
          summary: 'Sell value +28%',
          sellPriceMultiplier: 1.28,
        }),
        Object.freeze({
          cost: 350,
          summary: 'Sell value +45%',
          sellPriceMultiplier: 1.45,
        }),
      ]),
    }),
  }),
  pacingTargetsMinutes: Object.freeze({
    firstExpansion: Object.freeze({
      min: 8,
      max: 14,
    }),
    secondExpansion: Object.freeze({
      min: 18,
      max: 28,
    }),
  }),
  deterministicBalanceCheck: Object.freeze({
    firstExpansion: Object.freeze({
      loopDurationSeconds: 75,
      saleBundle: Object.freeze({
        turnip: 2,
      }),
    }),
    secondExpansion: Object.freeze({
      loopDurationSeconds: 75,
      saleBundle: Object.freeze({
        turnip: 3,
        egg: 1,
      }),
    }),
    buyMarketLedgerLevel1BeforeSecondExpansion: true,
  }),
})

export { expansionEconomyTuning }
