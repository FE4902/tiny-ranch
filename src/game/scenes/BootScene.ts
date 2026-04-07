import Phaser from 'phaser'

import { SCENE_KEYS } from '../constants'
import { getGameServices } from '../systems/runtime'

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot)
  }

  create(): void {
    const services = getGameServices(this)
    const cohort =
      this.sys.game.device.input.touch || this.scale.width <= 768 ? 'mobile_web' : 'desktop_web'

    services.performance.mark('boot:start')
    services.telemetry.track('boot_completed', {
      width: Math.round(this.scale.width),
      height: Math.round(this.scale.height),
      touch: this.sys.game.device.input.touch,
      cohort,
    })

    this.scene.start(SCENE_KEYS.preload)
  }
}
