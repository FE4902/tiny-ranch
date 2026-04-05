import Phaser from 'phaser'

import { PLAYABLE_SCENES, type PlayableSceneKey } from '../constants'
import { PerformanceTracker } from './performance'
import type { TelemetryClient } from './telemetry'

const REGISTRY_KEY = 'tiny-ranch:services'

export interface GameServices {
  telemetry: TelemetryClient
  performance: PerformanceTracker
  navigate: (sceneKey: PlayableSceneKey) => void
  getActiveScene: () => PlayableSceneKey | null
}

export function createGameServices(
  game: Phaser.Game,
  telemetry: TelemetryClient,
  performance: PerformanceTracker,
): GameServices {
  const getActiveScene = (): PlayableSceneKey | null => {
    const activeScene = game.registry.get('tiny-ranch:active-scene')

    if (
      typeof activeScene !== 'string' ||
      !PLAYABLE_SCENES.includes(activeScene as PlayableSceneKey)
    ) {
      return null
    }

    return activeScene as PlayableSceneKey
  }

  const setActiveScene = (sceneKey: PlayableSceneKey): void => {
    const currentScene = getActiveScene()

    if (currentScene === sceneKey) {
      return
    }

    if (currentScene !== null) {
      game.scene.stop(currentScene)
    }

    game.scene.start(sceneKey)
    game.registry.set('tiny-ranch:active-scene', sceneKey)
    telemetry.track('scene_changed', {
      from: currentScene,
      to: sceneKey,
    })
    game.events.emit('tiny-ranch:scene-changed', sceneKey)
  }

  return {
    telemetry,
    performance,
    navigate: setActiveScene,
    getActiveScene,
  }
}

export function registerGameServices(game: Phaser.Game, services: GameServices): void {
  game.registry.set(REGISTRY_KEY, services)
}

export function getGameServices(scene: Phaser.Scene): GameServices {
  const services = scene.game.registry.get(REGISTRY_KEY)

  if (!services) {
    throw new Error('Game services have not been registered')
  }

  return services as GameServices
}
