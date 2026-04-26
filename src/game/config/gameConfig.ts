import Phaser from 'phaser'

import { GAME_HEIGHT, GAME_WIDTH } from '../constants'
import { BarnScene } from '../scenes/BarnScene'
import { BootScene } from '../scenes/BootScene'
import { PreloadScene } from '../scenes/PreloadScene'
import { RanchScene } from '../scenes/RanchScene'
import { UiScene } from '../scenes/UiScene'

export function createGameConfig(parent: string): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#10241e',
    roundPixels: true,
    scene: [BootScene, PreloadScene, RanchScene, BarnScene, UiScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    render: {
      antialias: false,
      pixelArt: true,
      powerPreference: 'high-performance',
    },
  }
}
