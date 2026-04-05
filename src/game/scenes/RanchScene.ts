import { SCENE_KEYS } from '../constants'
import { BasePlayScene } from './BasePlayScene'

export class RanchScene extends BasePlayScene {
  protected readonly title = 'Main Ranch'
  protected readonly subtitle = 'PRIMARY PLAY SPACE'
  protected readonly detail =
    'Use this scene for the farming loop shell: crop rows, animal pens, and future interaction hotspots can all land here without touching the app bootstrap.'
  protected readonly palette = {
    skyTop: 0x183d31,
    skyBottom: 0x0d2018,
    accent: 0xf6bf5f,
    terrain: 0x315d42,
    terrainHighlight: 0x6da062,
  }

  constructor() {
    super(SCENE_KEYS.ranch)
  }
}
