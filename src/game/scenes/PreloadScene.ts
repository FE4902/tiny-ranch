import Phaser from 'phaser'

import badgeAssetUrl from '../../assets/placeholders/ranch-badge.svg'
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

    this.load.svg('ranch-badge', badgeAssetUrl)

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

    services.telemetry.track('preload_complete', { assets: 1 })

    if (!this.scene.isActive(SCENE_KEYS.ui)) {
      this.scene.launch(SCENE_KEYS.ui)
    }

    services.navigate(SCENE_KEYS.ranch)
    this.scene.stop()
  }
}
