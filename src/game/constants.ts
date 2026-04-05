export const GAME_TITLE = 'Tiny Ranch'
export const GAME_WIDTH = 390
export const GAME_HEIGHT = 844

export const SCENE_KEYS = {
  boot: 'boot',
  preload: 'preload',
  ranch: 'ranch',
  barn: 'barn',
  ui: 'ui',
} as const

export type PlayableSceneKey = typeof SCENE_KEYS.ranch | typeof SCENE_KEYS.barn

export const PLAYABLE_SCENES: PlayableSceneKey[] = [SCENE_KEYS.ranch, SCENE_KEYS.barn]
