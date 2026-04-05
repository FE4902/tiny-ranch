import Phaser from 'phaser'

import { getGameServices } from '../systems/runtime'

type ScenePalette = {
  skyTop: number
  skyBottom: number
  accent: number
  terrain: number
  terrainHighlight: number
}

export abstract class BasePlayScene extends Phaser.Scene {
  protected abstract readonly title: string
  protected abstract readonly subtitle: string
  protected abstract readonly detail: string
  protected abstract readonly palette: ScenePalette

  private readonly resizeHandler = (gameSize: Phaser.Structs.Size): void => {
    this.layout(gameSize.width, gameSize.height)
  }

  private background?: Phaser.GameObjects.Graphics
  private glow?: Phaser.GameObjects.Ellipse
  private panel?: Phaser.GameObjects.Container
  private titleText?: Phaser.GameObjects.Text
  private subtitleText?: Phaser.GameObjects.Text
  private detailText?: Phaser.GameObjects.Text
  private badge?: Phaser.GameObjects.Image

  create(): void {
    const services = getGameServices(this)

    services.performance.mark(`${this.scene.key}:create`)
    services.telemetry.track('scene_loaded', { scene: this.scene.key })

    this.background = this.add.graphics()
    this.glow = this.add.ellipse(0, 0, 0, 0, this.palette.accent, 0.18)
    this.titleText = this.add.text(0, 0, this.title, {
      fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
      fontSize: '42px',
      color: '#fdf5e6',
    })
    this.subtitleText = this.add.text(0, 0, this.subtitle, {
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: '13px',
      color: '#f6bf5f',
      letterSpacing: 1.6,
    })
    this.detailText = this.add.text(0, 0, this.detail, {
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '18px',
      color: '#d8e5dc',
      wordWrap: { width: 280 },
      lineSpacing: 8,
    })
    this.badge = this.add.image(0, 0, 'ranch-badge').setAlpha(0.95)

    const panelBackground = this.add.rectangle(0, 0, 0, 0, 0x103324, 0.74)
    panelBackground.setStrokeStyle(1, 0xffffff, 0.08)
    this.panel = this.add.container(0, 0, [
      panelBackground,
      this.subtitleText,
      this.titleText,
      this.detailText,
      this.badge,
    ])
    this.panel.setData('background', panelBackground)

    this.layout(this.scale.width, this.scale.height)

    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeHandler)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeHandler)
    })

    const firstFrameMark = `${this.scene.key}:create`
    requestAnimationFrame(() => {
      const firstFrameMs = services.performance.since(firstFrameMark)

      services.telemetry.track('scene_first_frame', {
        scene: this.scene.key,
        durationMs: firstFrameMs === null ? -1 : Math.round(firstFrameMs),
      })
    })
  }

  private layout(width: number, height: number): void {
    if (
      !this.background ||
      !this.glow ||
      !this.panel ||
      !this.titleText ||
      !this.subtitleText ||
      !this.detailText ||
      !this.badge
    ) {
      return
    }

    const safeWidth = Math.max(width, 320)
    const safeHeight = Math.max(height, 520)
    const panelWidth = Math.min(safeWidth - 36, 360)
    const panelHeight = Math.min(310, safeHeight * 0.42)
    const panelX = Math.min(safeWidth * 0.5, 212)
    const panelY = safeHeight * 0.51

    this.background.clear()
    this.background.fillGradientStyle(
      this.palette.skyTop,
      this.palette.skyTop,
      this.palette.skyBottom,
      this.palette.skyBottom,
      1,
    )
    this.background.fillRect(0, 0, safeWidth, safeHeight)
    this.background.fillStyle(this.palette.terrain, 1)
    this.background.fillEllipse(
      safeWidth * 0.5,
      safeHeight * 1.08,
      safeWidth * 1.3,
      safeHeight * 0.68,
    )
    this.background.fillStyle(this.palette.terrainHighlight, 0.5)
    this.background.fillEllipse(
      safeWidth * 0.34,
      safeHeight * 0.94,
      safeWidth * 0.48,
      safeHeight * 0.18,
    )
    this.background.fillEllipse(
      safeWidth * 0.7,
      safeHeight * 0.9,
      safeWidth * 0.34,
      safeHeight * 0.14,
    )

    this.glow.setPosition(safeWidth * 0.72, safeHeight * 0.24)
    this.glow.setSize(safeWidth * 0.45, safeWidth * 0.45)
    this.glow.setFillStyle(this.palette.accent, 0.18)

    const panelBackground = this.panel.getData('background') as Phaser.GameObjects.Rectangle
    panelBackground.setSize(panelWidth, panelHeight)
    panelBackground.setOrigin(0.5)

    this.panel.setPosition(panelX, panelY)
    this.subtitleText.setPosition(-panelWidth / 2 + 24, -panelHeight / 2 + 26)
    this.titleText.setPosition(-panelWidth / 2 + 24, -panelHeight / 2 + 48)
    this.detailText.setPosition(-panelWidth / 2 + 24, -panelHeight / 2 + 128)
    this.detailText.setWordWrapWidth(panelWidth - 48)

    const badgeSize = Math.min(112, panelWidth * 0.3)
    this.badge.setPosition(panelWidth / 2 - badgeSize * 0.58, -panelHeight / 2 + badgeSize * 0.62)
    this.badge.setDisplaySize(badgeSize, badgeSize)
  }
}
