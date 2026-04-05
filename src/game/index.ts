import Phaser from 'phaser'

import { createGameConfig } from './config/gameConfig'
import { PerformanceTracker } from './systems/performance'
import { createGameServices, registerGameServices } from './systems/runtime'
import { ConsoleTelemetryClient } from './systems/telemetry'

export function createGame(parent: string): Phaser.Game {
  const game = new Phaser.Game(createGameConfig(parent))
  const telemetry = new ConsoleTelemetryClient()
  const performance = new PerformanceTracker()
  const services = createGameServices(game, telemetry, performance)

  registerGameServices(game, services)

  return game
}
