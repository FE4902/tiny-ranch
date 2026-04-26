export const RANCH_TILE_SIZE = 16
export const RANCH_MAP_WIDTH = 22
export const RANCH_MAP_HEIGHT = 18

export type RanchZoneId =
  | 'barn_entry'
  | 'crop_area'
  | 'animal_pen'
  | 'shipping_crate'
  | 'market_stall'
  | 'utility_well'

export interface TileRect {
  x: number
  y: number
  width: number
  height: number
}

export interface RanchZone extends TileRect {
  id: RanchZoneId
  label: string
  purpose: 'navigation' | 'farming' | 'animals' | 'economy' | 'utility'
}

export interface RanchCollisionTile {
  x: number
  y: number
  reason: 'structure' | 'fence' | 'water' | 'prop'
}

export interface RanchLandmark extends TileRect {
  id: string
  kind: 'structure' | 'crop' | 'animal' | 'economy' | 'utility'
}

export interface RanchCropPlot {
  id: string
  x: number
  y: number
}

export interface RanchSpritePlacement {
  id: string
  key:
    | 'tiny-ranch-tiles'
    | 'tiny-ranch-structures'
    | 'tiny-ranch-crops'
    | 'tiny-ranch-animals'
    | 'tiny-ranch-items'
    | 'tiny-ranch-decorations'
  frame: number
  tileX: number
  tileY: number
  layer: 'terrain' | 'decor' | 'structure' | 'crop' | 'animal' | 'item'
}

export interface RanchMapContract {
  width: number
  height: number
  tileSize: number
  spawnTile: {
    x: number
    y: number
  }
  baseFrameCycle: number[]
  pathFrameCycle: number[]
  soilFrameCycle: number[]
  waterFrameCycle: number[]
  pathPatches: TileRect[]
  soilPatches: TileRect[]
  waterPatches: TileRect[]
  cropPlots: RanchCropPlot[]
  zones: RanchZone[]
  collisionTiles: RanchCollisionTile[]
  landmarks: RanchLandmark[]
  spritePlacements: RanchSpritePlacement[]
}

const BARN_FOOTPRINT: TileRect = { x: 10, y: 4, width: 4, height: 2 }
const SILO_FOOTPRINT: TileRect = { x: 15, y: 4, width: 2, height: 2 }
const SHIPPING_FOOTPRINT: TileRect = { x: 2, y: 6, width: 2, height: 2 }
const POND_FOOTPRINT: TileRect = { x: 18, y: 2, width: 3, height: 3 }
const PEN_AREA: TileRect = { x: 13, y: 8, width: 7, height: 6 }
const MAIN_CROP_AREA: TileRect = { x: 2, y: 10, width: 7, height: 5 }

const DECORATION_FOOTPRINTS: TileRect[] = [
  { x: 0, y: 2, width: 1, height: 1 },
  { x: 1, y: 15, width: 1, height: 1 },
  { x: 6, y: 2, width: 1, height: 1 },
  { x: 18, y: 6, width: 1, height: 1 },
  { x: 21, y: 12, width: 1, height: 1 },
  { x: 20, y: 16, width: 1, height: 1 },
]

const PEN_GATE: TileRect = { x: 16, y: 13, width: 2, height: 1 }

function expandRect(rect: TileRect, reason: RanchCollisionTile['reason']): RanchCollisionTile[] {
  const tiles: RanchCollisionTile[] = []

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      tiles.push({ x, y, reason })
    }
  }

  return tiles
}

function isInRect(x: number, y: number, rect: TileRect): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
}

function createPerimeterCollision(
  rect: TileRect,
  reason: RanchCollisionTile['reason'],
  opening: TileRect | null = null,
): RanchCollisionTile[] {
  const tiles: RanchCollisionTile[] = []

  for (let x = rect.x; x < rect.x + rect.width; x += 1) {
    tiles.push({ x, y: rect.y, reason })
    tiles.push({ x, y: rect.y + rect.height - 1, reason })
  }

  for (let y = rect.y + 1; y < rect.y + rect.height - 1; y += 1) {
    tiles.push({ x: rect.x, y, reason })
    tiles.push({ x: rect.x + rect.width - 1, y, reason })
  }

  if (!opening) {
    return tiles
  }

  return tiles.filter((tile) => !isInRect(tile.x, tile.y, opening))
}

function dedupeCollisionTiles(tiles: RanchCollisionTile[]): RanchCollisionTile[] {
  const seen = new Map<string, RanchCollisionTile>()

  tiles.forEach((tile) => {
    const key = `${tile.x}:${tile.y}`
    if (!seen.has(key)) {
      seen.set(key, tile)
    }
  })

  return [...seen.values()]
}

function createFencePlacements(): RanchSpritePlacement[] {
  const placements: RanchSpritePlacement[] = []

  for (let x = PEN_AREA.x; x < PEN_AREA.x + PEN_AREA.width; x += 1) {
    placements.push({
      id: `pen-top-${x}`,
      key: 'tiny-ranch-structures',
      frame: 64,
      tileX: x,
      tileY: PEN_AREA.y,
      layer: 'structure',
    })

    if (!isInRect(x, PEN_AREA.y + PEN_AREA.height - 1, PEN_GATE)) {
      placements.push({
        id: `pen-bottom-${x}`,
        key: 'tiny-ranch-structures',
        frame: 64,
        tileX: x,
        tileY: PEN_AREA.y + PEN_AREA.height - 1,
        layer: 'structure',
      })
    }
  }

  for (let y = PEN_AREA.y + 1; y < PEN_AREA.y + PEN_AREA.height - 1; y += 1) {
    placements.push({
      id: `pen-left-${y}`,
      key: 'tiny-ranch-structures',
      frame: 65,
      tileX: PEN_AREA.x,
      tileY: y,
      layer: 'structure',
    })
    placements.push({
      id: `pen-right-${y}`,
      key: 'tiny-ranch-structures',
      frame: 65,
      tileX: PEN_AREA.x + PEN_AREA.width - 1,
      tileY: y,
      layer: 'structure',
    })
  }

  placements.push({
    id: 'pen-gate-left',
    key: 'tiny-ranch-structures',
    frame: 70,
    tileX: PEN_GATE.x,
    tileY: PEN_GATE.y,
    layer: 'structure',
  })
  placements.push({
    id: 'pen-gate-right',
    key: 'tiny-ranch-structures',
    frame: 71,
    tileX: PEN_GATE.x + 1,
    tileY: PEN_GATE.y,
    layer: 'structure',
  })

  return placements
}

function createCropPlots(rect: TileRect): RanchCropPlot[] {
  const plots: RanchCropPlot[] = []

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      plots.push({
        id: `crop-plot-${x}-${y}`,
        x,
        y,
      })
    }
  }

  return plots
}

function createDecorationPlacements(): RanchSpritePlacement[] {
  return [
    {
      id: 'orchard-tree-west',
      key: 'tiny-ranch-decorations',
      frame: 8,
      tileX: 0,
      tileY: 2,
      layer: 'decor',
    },
    {
      id: 'flower-clump-north',
      key: 'tiny-ranch-decorations',
      frame: 6,
      tileX: 6,
      tileY: 2,
      layer: 'decor',
    },
    {
      id: 'rock-by-pond',
      key: 'tiny-ranch-decorations',
      frame: 45,
      tileX: 18,
      tileY: 6,
      layer: 'decor',
    },
    {
      id: 'wildflower-crop-edge',
      key: 'tiny-ranch-decorations',
      frame: 4,
      tileX: 1,
      tileY: 15,
      layer: 'decor',
    },
    {
      id: 'grass-clump-east',
      key: 'tiny-ranch-decorations',
      frame: 30,
      tileX: 21,
      tileY: 12,
      layer: 'decor',
    },
    {
      id: 'stump-south',
      key: 'tiny-ranch-decorations',
      frame: 40,
      tileX: 20,
      tileY: 16,
      layer: 'decor',
    },
  ]
}

export const ranchMapContract: RanchMapContract = {
  width: RANCH_MAP_WIDTH,
  height: RANCH_MAP_HEIGHT,
  tileSize: RANCH_TILE_SIZE,
  spawnTile: {
    x: 6,
    y: 9,
  },
  baseFrameCycle: [0, 1, 2, 3, 4, 5, 6, 7],
  pathFrameCycle: [10, 11, 12, 13, 14],
  soilFrameCycle: [20, 21, 22, 23, 24],
  waterFrameCycle: [9, 49],
  pathPatches: [
    { x: 0, y: 8, width: 22, height: 2 },
    { x: 11, y: 6, width: 2, height: 2 },
    { x: 8, y: 10, width: 4, height: 2 },
    { x: 12, y: 10, width: 4, height: 2 },
    { x: 2, y: 7, width: 3, height: 2 },
  ],
  soilPatches: [MAIN_CROP_AREA],
  waterPatches: [POND_FOOTPRINT],
  cropPlots: createCropPlots(MAIN_CROP_AREA),
  zones: [
    {
      id: 'barn_entry',
      label: 'Barn Entry',
      purpose: 'navigation',
      x: 11,
      y: 6,
      width: 2,
      height: 2,
    },
    {
      id: 'crop_area',
      label: 'Crop Area',
      purpose: 'farming',
      x: MAIN_CROP_AREA.x,
      y: MAIN_CROP_AREA.y,
      width: MAIN_CROP_AREA.width,
      height: MAIN_CROP_AREA.height,
    },
    {
      id: 'animal_pen',
      label: 'Animal Pen',
      purpose: 'animals',
      x: PEN_AREA.x,
      y: PEN_AREA.y,
      width: PEN_AREA.width,
      height: PEN_AREA.height,
    },
    {
      id: 'shipping_crate',
      label: 'Shipping Crate',
      purpose: 'economy',
      x: 2,
      y: 6,
      width: 3,
      height: 2,
    },
    {
      id: 'market_stall',
      label: 'Market Stall',
      purpose: 'economy',
      x: 4,
      y: 6,
      width: 3,
      height: 2,
    },
    {
      id: 'utility_well',
      label: 'Utility Well',
      purpose: 'utility',
      x: 7,
      y: 5,
      width: 2,
      height: 2,
    },
  ],
  collisionTiles: dedupeCollisionTiles([
    ...expandRect(BARN_FOOTPRINT, 'structure'),
    ...expandRect(SILO_FOOTPRINT, 'structure'),
    ...expandRect(SHIPPING_FOOTPRINT, 'prop'),
    ...expandRect(POND_FOOTPRINT, 'water'),
    ...DECORATION_FOOTPRINTS.flatMap((footprint) => expandRect(footprint, 'prop')),
    ...createPerimeterCollision(PEN_AREA, 'fence', PEN_GATE),
  ]),
  landmarks: [
    { id: 'barn', kind: 'structure', x: 10, y: 4, width: 4, height: 2 },
    { id: 'silo', kind: 'structure', x: 15, y: 4, width: 2, height: 2 },
    { id: 'crop-plot-main', kind: 'crop', x: 2, y: 10, width: 7, height: 5 },
    { id: 'animal-pen-main', kind: 'animal', x: 13, y: 8, width: 7, height: 6 },
    { id: 'shipping-crate', kind: 'economy', x: 2, y: 6, width: 2, height: 2 },
    { id: 'market-stall', kind: 'economy', x: 4, y: 6, width: 2, height: 2 },
    { id: 'utility-well', kind: 'utility', x: 7, y: 5, width: 2, height: 2 },
    { id: 'pond', kind: 'utility', x: 18, y: 2, width: 3, height: 3 },
  ],
  spritePlacements: [
    { id: 'barn-a', key: 'tiny-ranch-structures', frame: 0, tileX: 10, tileY: 4, layer: 'structure' },
    { id: 'barn-b', key: 'tiny-ranch-structures', frame: 1, tileX: 11, tileY: 4, layer: 'structure' },
    { id: 'barn-c', key: 'tiny-ranch-structures', frame: 2, tileX: 12, tileY: 4, layer: 'structure' },
    { id: 'barn-d', key: 'tiny-ranch-structures', frame: 3, tileX: 13, tileY: 4, layer: 'structure' },
    { id: 'barn-e', key: 'tiny-ranch-structures', frame: 8, tileX: 10, tileY: 5, layer: 'structure' },
    { id: 'barn-f', key: 'tiny-ranch-structures', frame: 9, tileX: 11, tileY: 5, layer: 'structure' },
    { id: 'barn-g', key: 'tiny-ranch-structures', frame: 10, tileX: 12, tileY: 5, layer: 'structure' },
    { id: 'barn-h', key: 'tiny-ranch-structures', frame: 11, tileX: 13, tileY: 5, layer: 'structure' },
    { id: 'silo-a', key: 'tiny-ranch-structures', frame: 29, tileX: 15, tileY: 4, layer: 'structure' },
    { id: 'silo-b', key: 'tiny-ranch-structures', frame: 30, tileX: 16, tileY: 4, layer: 'structure' },
    { id: 'silo-c', key: 'tiny-ranch-structures', frame: 37, tileX: 15, tileY: 5, layer: 'structure' },
    { id: 'silo-d', key: 'tiny-ranch-structures', frame: 38, tileX: 16, tileY: 5, layer: 'structure' },
    { id: 'shipping-crate', key: 'tiny-ranch-items', frame: 15, tileX: 2, tileY: 6, layer: 'item' },
    { id: 'market-stall', key: 'tiny-ranch-items', frame: 17, tileX: 5, tileY: 6, layer: 'item' },
    { id: 'utility-well', key: 'tiny-ranch-structures', frame: 32, tileX: 7, tileY: 5, layer: 'structure' },
    { id: 'utility-well-shadow', key: 'tiny-ranch-structures', frame: 40, tileX: 8, tileY: 5, layer: 'structure' },
    { id: 'animal-1', key: 'tiny-ranch-animals', frame: 0, tileX: 15, tileY: 10, layer: 'animal' },
    { id: 'animal-2', key: 'tiny-ranch-animals', frame: 3, tileX: 17, tileY: 11, layer: 'animal' },
    { id: 'animal-3', key: 'tiny-ranch-animals', frame: 18, tileX: 14, tileY: 12, layer: 'animal' },
    ...createDecorationPlacements(),
    ...createFencePlacements(),
  ],
}

export function getRanchMapWorldSize(contract: RanchMapContract): { width: number; height: number } {
  return {
    width: contract.width * contract.tileSize,
    height: contract.height * contract.tileSize,
  }
}
