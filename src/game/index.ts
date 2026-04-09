import Phaser from 'phaser'

import { createGameConfig } from './config/gameConfig'
import { telemetryRuntimeConfig } from './config/telemetry'
import { PerformanceTracker } from './systems/performance'
import { createGameServices, registerGameServices } from './systems/runtime'
import { createTelemetryClient } from './systems/telemetry'
import { installSmokeHarness } from './testing/smokeHarness'

export function createGame(parent: string): Phaser.Game {
  const game = new Phaser.Game(createGameConfig(parent))
  const telemetry = createTelemetryClient(telemetryRuntimeConfig)
  const performance = new PerformanceTracker()
  const services = createGameServices(game, telemetry, performance)

  registerGameServices(game, services)
  services.hydrateSavedGameStateOnBoot()
  installSmokeHarness(game)
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    telemetry.destroy()
  })

  return game
}
