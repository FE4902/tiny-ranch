import Phaser from 'phaser'

import { SCENE_KEYS, type PlayableSceneKey } from '../constants'
import { getGameServices } from '../systems/runtime'
import { TextButton } from '../ui/TextButton'

export class UiScene extends Phaser.Scene {
  private activeSceneLabel?: Phaser.GameObjects.Text
  private buttons = new Map<PlayableSceneKey, TextButton>()

  constructor() {
    super(SCENE_KEYS.ui)
  }

  create(): void {
    const services = getGameServices(this)

    const toolbar = this.add.rectangle(0, 0, 0, 66, 0x071511, 0.56).setOrigin(0)
    toolbar.setStrokeStyle(1, 0xffffff, 0.08)

    const ranchButton = new TextButton(this, 86, 32, '1 Ranch', () => {
      services.navigate(SCENE_KEYS.ranch)
    })
    const barnButton = new TextButton(this, 206, 32, '2 Barn', () => {
      services.navigate(SCENE_KEYS.barn)
    })

    this.buttons.set(SCENE_KEYS.ranch, ranchButton)
    this.buttons.set(SCENE_KEYS.barn, barnButton)

    this.activeSceneLabel = this.add
      .text(0, 0, 'Now viewing: ranch', {
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
        fontSize: '13px',
        color: '#f4efe3',
      })
      .setOrigin(1, 0.5)

    this.add.existing(ranchButton)
    this.add.existing(barnButton)

    const layout = (): void => {
      const { width } = this.scale
      toolbar.setSize(width, 66)
      this.activeSceneLabel?.setPosition(width - 18, 32)
    }

    const setSelectedScene = (sceneKey: PlayableSceneKey): void => {
      this.activeSceneLabel?.setText(`Now viewing: ${sceneKey}`)
      for (const [key, button] of this.buttons) {
        button.setSelected(key === sceneKey)
      }
    }

    layout()
    setSelectedScene(services.getActiveScene() ?? SCENE_KEYS.ranch)

    this.scale.on(Phaser.Scale.Events.RESIZE, layout)
    this.game.events.on('tiny-ranch:scene-changed', setSelectedScene)

    this.input.keyboard?.on('keydown-ONE', () => services.navigate(SCENE_KEYS.ranch))
    this.input.keyboard?.on('keydown-TWO', () => services.navigate(SCENE_KEYS.barn))

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout)
      this.game.events.off('tiny-ranch:scene-changed', setSelectedScene)
      this.input.keyboard?.off('keydown-ONE')
      this.input.keyboard?.off('keydown-TWO')
    })
  }
}
