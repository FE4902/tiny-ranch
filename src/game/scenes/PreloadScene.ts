import Phaser from 'phaser'

import badgeAssetUrl from '../../assets/placeholders/ranch-badge.svg?url'
import {
  createTinyRanchPreloadStatusSnapshot,
  preloadTinyRanchSpritesheets,
  tinyRanchPreloadVisualCheckFrames,
} from '../assets/tinyRanchAssets'
import { SCENE_KEYS, type PlayableSceneKey } from '../constants'
import { getGameServices } from '../systems/runtime'

const PRELOAD_VISUAL_CHECK_HOLD_MS = 120
const PRELOAD_VISUAL_CHECK_SPRITE_SIZE = 20
const PRELOAD_VISUAL_CHECK_GAP = 8

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
    preloadTinyRanchSpritesheets(this)

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
    const preloadStatus = createTinyRanchPreloadStatusSnapshot(this)

    this.registry.set('tiny-ranch:preload-assets', preloadStatus)
    this.renderVisualCheck()

    services.telemetry.track('preload_complete', {
      assets: preloadStatus.loadedSheetCount + 1,
      tinyRanchSheets: preloadStatus.loadedSheetCount,
      tinyRanchFrames: preloadStatus.loadedFrameCount,
      startupScene,
    })

    this.time.delayedCall(PRELOAD_VISUAL_CHECK_HOLD_MS, () => {
      if (!this.scene.isActive(SCENE_KEYS.preload)) {
        return
      }

      this.startPlayableScene(startupScene)
    })
  }

  private renderVisualCheck(): void {
    const { width, height } = this.scale
    const totalWidth =
      tinyRanchPreloadVisualCheckFrames.length * PRELOAD_VISUAL_CHECK_SPRITE_SIZE +
      (tinyRanchPreloadVisualCheckFrames.length - 1) * PRELOAD_VISUAL_CHECK_GAP
    const startX = width / 2 - totalWidth / 2 + PRELOAD_VISUAL_CHECK_SPRITE_SIZE / 2
    const y = height / 2 + 40

    tinyRanchPreloadVisualCheckFrames.forEach((previewFrame, index) => {
      if (!this.textures.exists(previewFrame.key)) {
        return
      }

      this.add
        .image(
          startX + index * (PRELOAD_VISUAL_CHECK_SPRITE_SIZE + PRELOAD_VISUAL_CHECK_GAP),
          y,
          previewFrame.key,
          previewFrame.frame,
        )
        .setDisplaySize(PRELOAD_VISUAL_CHECK_SPRITE_SIZE, PRELOAD_VISUAL_CHECK_SPRITE_SIZE)
        .setName(`preload-check:${previewFrame.category}`)
    })
  }

  private startPlayableScene(startupScene: PlayableSceneKey): void {
    const services = getGameServices(this)

    if (!this.scene.isActive(SCENE_KEYS.ui)) {
      this.scene.launch(SCENE_KEYS.ui)
    }

    services.navigate(startupScene)
    this.scene.stop()
  }
}
