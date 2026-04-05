import Phaser from 'phaser'

import { SCENE_KEYS } from '../constants'
import { getGameServices } from '../systems/runtime'

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot)
  }

  create(): void {
    const services = getGameServices(this)

    services.performance.mark('boot:start')
    services.telemetry.track('boot_completed', {
      width: Math.round(this.scale.width),
      height: Math.round(this.scale.height),
      touch: this.sys.game.device.input.touch,
    })

    this.scene.start(SCENE_KEYS.preload)
  }
}
