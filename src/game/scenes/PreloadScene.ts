import Phaser from 'phaser'

import badgeAssetUrl from '../../assets/placeholders/ranch-badge.svg?url'
import {
  preloadTinyRanchSpritesheets,
  tinyRanchMvpSpritesheetCount,
} from '../assets/tinyRanchAssets'
import { SCENE_KEYS } from '../constants'
import { getGameServices } from '../systems/runtime'

export class PreloadScene extends Phaser.Scene {
  private progressBar?: Phaser.GameObjects.Graphics

  constructor() {
    super(SCENE_KEYS.preload)
  }

  preload(): void {
    this.cameras.main.setBackgroundColor('#10241e')

    const { width, height } = this.scale
    this.progressBar = this.add.graphics()
    this.add
      .text(width / 2, height / 2 - 42, 'Loading ranch shell...', {
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '18px',
        color: '#f4efe3',
      })
      .setOrigin(0.5)

    this.load.image('ranch-badge', badgeAssetUrl)
    preloadTinyRanchSpritesheets(this, { mvpOnly: true })

    this.load.on('progress', (value: number) => {
      if (!this.progressBar) {
        return
      }

      const barWidth = Math.min(width - 72, 320)
      const barHeight = 12
      const left = (width - barWidth) / 2
      const top = height / 2

      this.progressBar.clear()
      this.progressBar.fillStyle(0x29533f, 0.75)
      this.progressBar.fillRoundedRect(left, top, barWidth, barHeight, 6)
      this.progressBar.fillStyle(0xf6bf5f, 1)
      this.progressBar.fillRoundedRect(left, top, barWidth * value, barHeight, 6)
    })
  }

  create(): void {
    const services = getGameServices(this)
    const startupScene = services.getPreferredStartupScene()

    services.telemetry.track('preload_complete', {
      assets: tinyRanchMvpSpritesheetCount + 1,
      startupScene,
    })

    if (!this.scene.isActive(SCENE_KEYS.ui)) {
      this.scene.launch(SCENE_KEYS.ui)
    }

    services.navigate(startupScene)
    this.scene.stop()
  }
}
