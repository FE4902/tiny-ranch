import { SCENE_KEYS } from '../constants'
import { BasePlayScene } from './BasePlayScene'

export class BarnScene extends BasePlayScene {
  protected readonly title = 'Barn & Storage'
  protected readonly subtitle = 'SECONDARY FOUNDATION SCENE'
  protected readonly detail =
    'This parallel shell proves scene routing now, so inventory, production, or shop loops can branch without rewriting the runtime and UI layers.'
  protected readonly palette = {
    skyTop: 0x422918,
    skyBottom: 0x21120b,
    accent: 0xffd28b,
    terrain: 0x644131,
    terrainHighlight: 0x986b54,
  }

  constructor() {
    super(SCENE_KEYS.barn)
  }
}
