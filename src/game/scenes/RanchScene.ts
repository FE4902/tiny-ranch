import Phaser from 'phaser'

import { getAnimalProductionConfig, type AnimalProductionId } from '../config/animals'
import { defaultCropSeedId, getCropSeedConfig, type CropSeedId } from '../config/crops'
import { getItemSellPrice } from '../config/economy'
import { getExpansionTierConfig } from '../config/expansion'
import {
  ftueConfig,
  getFtueStepConfig,
  getFtueStepIndex,
  type FtueProgressSignal,
} from '../config/ftue'
import {
  getNextUpgradeLevelConfig,
  getUpgradeConfig,
  getUpgradeLevelConfig,
  getUpgradeMaxLevel,
  type UpgradeId,
  upgradeIds,
} from '../config/upgrades'
import { SCENE_KEYS } from '../constants'
import {
  getRanchMapWorldSize,
  type RanchLandmark,
  ranchMapContract,
  type RanchMapContract,
  type RanchSpritePlacement,
  type RanchZone,
  type TileRect,
} from '../maps/ranchMap'
import {
  getGameServices,
  type BarnHandoffStateSnapshot,
  type ExpansionStateSnapshot,
  type FtueStateSnapshot,
  type RanchStateSnapshot,
  type ReturnObjectiveStateSnapshot,
} from '../systems/runtime'

const HUD_SAFE_TOP = 140
const SCENE_PADDING = 12
const PLAYER_MOVE_SPEED = 74
const PLAYER_COLLISION_RADIUS_FACTOR = 0.26
const INTERACTION_RANGE_TILES = 1.25
const PLAYER_ANIMATION_PREFIX = 'tiny-ranch:player'
const CROP_ZONE_INTERACTABLE_ID = 'zone:crop_area'
const ANIMAL_PEN_INTERACTABLE_ID = 'zone:animal_pen'
const SHIPPING_CRATE_ZONE_INTERACTABLE_ID = 'zone:shipping_crate'
const MARKET_STALL_ZONE_INTERACTABLE_ID = 'zone:market_stall'
const UTILITY_WELL_ZONE_INTERACTABLE_ID = 'zone:utility_well'
const SHIPPING_CRATE_LANDMARK_INTERACTABLE_ID = 'landmark:shipping-crate'
const MARKET_STALL_LANDMARK_INTERACTABLE_ID = 'landmark:market-stall'
const UTILITY_WELL_LANDMARK_INTERACTABLE_ID = 'landmark:utility-well'
const FEEDBACK_COLOR_DEFAULT = '#f6bf5f'
const FEEDBACK_COLOR_SUCCESS = '#8dd6a0'
const FEEDBACK_COLOR_ERROR = '#ff9f7a'
const UPGRADE_LABEL_COLOR = '#f4efe3'
const FTUE_LABEL_COLOR = '#f4efe3'
const FTUE_LABEL_BG = '#10241ee0'
const FTUE_LABEL_MAX_WIDTH = 300
const RETURN_OBJECTIVE_LABEL_COLOR = '#d7f4ff'
const RETURN_OBJECTIVE_LABEL_BG = '#0d2a3de0'
const RETURN_OBJECTIVE_LABEL_MAX_WIDTH = 320
const RETURN_OBJECTIVE_CLAIM_BUTTON_BG = '#2f5f7a'
const RETURN_OBJECTIVE_CLAIM_BUTTON_BG_READY = '#3f8cb5'
const RETURN_OBJECTIVE_CLAIM_BUTTON_TEXT = '#f4fbff'
const UPGRADE_PANEL_MAX_WIDTH = 360
const UPGRADE_PANEL_GAP = 8
const TOUCH_MOVE_TARGET_COLOR = 0x74d5ff
const TOUCH_MOVE_TARGET_STROKE_COLOR = 0xd5f3ff
const TOUCH_MOVE_INVALID_COLOR = 0xff9f7a
const TOUCH_MOVE_INVALID_STROKE_COLOR = 0xffd6c8
const TOUCH_MOVE_ARRIVE_DISTANCE_PX = 2
const TOUCH_MOVE_BLOCKED_FRAMES_THRESHOLD = 8

type FacingDirection = 'down' | 'left' | 'right' | 'up'
type MovementInputSource = 'keyboard' | 'touch'

type InteractableType = 'zone' | 'landmark'
type PlantInputSource = 'keyboard' | 'pointer'
type AnimalInputSource = 'keyboard' | 'pointer'
type SellInputSource = 'keyboard' | 'pointer'
type UpgradeInputSource = 'keyboard' | 'pointer'
type ExpansionInputSource = 'keyboard' | 'pointer'

export interface RanchSceneDebugUiSnapshot {
  ftueObjectiveVisible: boolean
  ftueObjectiveText: string
  returnObjectiveVisible: boolean
  returnObjectiveText: string
  returnObjectiveClaimButtonVisible: boolean
  returnObjectiveClaimButtonText: string
}

type PlantingValidationResult =
  | 'ok'
  | 'invalid_zone'
  | 'zone_locked'
  | 'capacity_locked'
  | 'occupied'
  | 'blocked'
  | 'out_of_bounds'

interface RanchInteractable {
  id: string
  label: string
  type: InteractableType
  x: number
  y: number
  width: number
  height: number
}

interface TilePosition {
  x: number
  y: number
}

interface PlantedCrop {
  seedId: CropSeedId
  tileX: number
  tileY: number
  plantedAtEpochMs: number
  stageIndex: number
  nextStageTimeoutId: ReturnType<typeof window.setTimeout> | null
  sprite: Phaser.GameObjects.Image
}

interface AnimalProductionSlot {
  id: string
  tileX: number
  tileY: number
  configId: AnimalProductionId
  baseFrame: number
  sprite: Phaser.GameObjects.Image
  isActive: boolean
  isFed: boolean
  hasProductReady: boolean
  cycleStartedAtEpochMs: number | null
  nextProductAtEpochMs: number | null
  nextProductTimeoutId: ReturnType<typeof window.setTimeout> | null
}

const animalSlotConfigByPlacementId: Readonly<Record<string, AnimalProductionId>> = {
  'animal-1': 'chicken',
  'animal-2': 'cow',
  'animal-3': 'sheep',
}

const layerOrder: Record<RanchSpritePlacement['layer'], number> = {
  terrain: 1,
  decor: 2,
  structure: 3,
  crop: 4,
  item: 5,
  animal: 6,
}

export class RanchScene extends Phaser.Scene {
  private mapRoot?: Phaser.GameObjects.Container
  private cropLayer?: Phaser.GameObjects.Container
  private backdrop?: Phaser.GameObjects.Graphics
  private player?: Phaser.GameObjects.Sprite
  private interactionHighlight?: Phaser.GameObjects.Rectangle
  private touchMoveIndicator?: Phaser.GameObjects.Rectangle
  private interactionPrompt?: Phaser.GameObjects.Text
  private interactionFeedback?: Phaser.GameObjects.Text
  private upgradePanelBg?: Phaser.GameObjects.Rectangle
  private upgradePanelTitle?: Phaser.GameObjects.Text
  private readonly upgradeEntryLabels = new Map<UpgradeId, Phaser.GameObjects.Text>()
  private upgradePanelHeight = 0
  private ftueObjectiveLabel?: Phaser.GameObjects.Text
  private returnObjectiveLabel?: Phaser.GameObjects.Text
  private returnObjectiveClaimButton?: Phaser.GameObjects.Text
  private cropZone: RanchZone | null = null
  private animalZone: RanchZone | null = null
  private inputPrefersTouch = false
  private activeSeedId: CropSeedId = defaultCropSeedId
  private readonly plantedCrops = new Map<string, PlantedCrop>()
  private readonly animalSlots = new Map<string, AnimalProductionSlot>()
  private readonly animalSlotsByTileKey = new Map<string, AnimalProductionSlot>()
  private readonly collisionTiles = new Set<string>()
  private readonly interactables: RanchInteractable[] = []
  private unsubscribeInventoryChanges?: () => void
  private unsubscribeCurrencyChanges?: () => void
  private unsubscribeBarnChanges?: () => void
  private unsubscribeExpansionChanges?: () => void
  private unsubscribeUpgradeChanges?: () => void
  private unsubscribeFtueStateChanges?: () => void
  private unsubscribeReturnObjectiveChanges?: () => void
  private expansionState: ExpansionStateSnapshot | null = null
  private activeInteractable: RanchInteractable | null = null
  private touchMoveTargetTile: TilePosition | null = null
  private touchMoveTargetWorld: Phaser.Math.Vector2 | null = null
  private touchMoveBlockedFrames = 0
  private playerFacing: FacingDirection = 'down'
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys
  private moveUpKey?: Phaser.Input.Keyboard.Key
  private moveDownKey?: Phaser.Input.Keyboard.Key
  private moveLeftKey?: Phaser.Input.Keyboard.Key
  private moveRightKey?: Phaser.Input.Keyboard.Key
  private interactKey?: Phaser.Input.Keyboard.Key
  private interactAltKey?: Phaser.Input.Keyboard.Key
  private upgradeHotkeyOne?: Phaser.Input.Keyboard.Key
  private upgradeHotkeyTwo?: Phaser.Input.Keyboard.Key
  private upgradeHotkeyThree?: Phaser.Input.Keyboard.Key
  private claimObjectiveHotkey?: Phaser.Input.Keyboard.Key
  private hasTrackedUpgradePanelView = false

  private readonly resizeHandler = (): void => {
    this.inputPrefersTouch = this.isTouchInputPreferred()
    this.configureUpgradeUiInteractivity()
    this.layoutMap(ranchMapContract)
    this.drawBackdrop()
    this.layoutInteractionUi()
    this.layoutUpgradeUi()
    this.refreshUpgradeUi()
    this.layoutFtueObjectiveUi()
    this.refreshFtueObjectiveUi()
    this.layoutReturnObjectiveUi()
    this.refreshReturnObjectiveUi()
    this.updateInteractionState(ranchMapContract)
  }
  private readonly visibilityChangeHandler = (): void => {
    if (document.visibilityState !== 'visible') {
      return
    }

    this.syncCropGrowthFromClock()
    this.syncAnimalProductionFromClock()
  }
  private readonly focusHandler = (): void => {
    this.syncCropGrowthFromClock()
    this.syncAnimalProductionFromClock()
  }

  constructor() {
    super(SCENE_KEYS.ranch)
  }

  create(): void {
    const services = getGameServices(this)
    this.inputPrefersTouch = this.isTouchInputPreferred()
    this.expansionState = services.getExpansionStateSnapshot()

    this.backdrop = this.add.graphics()
    this.mapRoot = this.add.container(0, 0)
    this.cropLayer = this.add.container(0, 0)

    this.renderTerrainLayer(ranchMapContract)
    this.renderPatchLayer(ranchMapContract, ranchMapContract.pathPatches, ranchMapContract.pathFrameCycle)
    this.renderPatchLayer(ranchMapContract, ranchMapContract.soilPatches, ranchMapContract.soilFrameCycle)
    this.renderCropPlotLayer(ranchMapContract)
    this.renderPatchLayer(ranchMapContract, ranchMapContract.waterPatches, ranchMapContract.waterFrameCycle)
    this.renderSpriteLayer(ranchMapContract)
    this.renderZoneLayer(ranchMapContract)
    this.mapRoot.add(this.cropLayer)
    this.buildCollisionLookup(ranchMapContract)
    this.buildInteractables(ranchMapContract)
    this.cropZone = this.resolveCropZone(ranchMapContract)
    this.animalZone = this.resolveAnimalZone(ranchMapContract)
    this.createInteractionHighlight()
    this.createTouchMoveIndicator()
    this.createPlayer(ranchMapContract)
    this.createInteractionUi()
    this.createUpgradeUi()
    this.createFtueObjectiveUi()
    this.createReturnObjectiveUi()
    this.configureInput()
    this.configurePointerInput()

    this.layoutMap(ranchMapContract)
    this.drawBackdrop()
    this.layoutInteractionUi()
    this.layoutUpgradeUi()
    this.layoutFtueObjectiveUi()
    this.layoutReturnObjectiveUi()
    const restoredSnapshot = this.hydrateRanchStateSnapshot(ranchMapContract)
    this.syncFtueProgressFromWorldState()
    this.refreshUpgradeUi()
    this.trackUpgradePanelViewed()
    this.refreshFtueObjectiveUi()
    this.refreshReturnObjectiveUi()
    this.refreshExpansionGatedVisuals()
    this.updateInteractionState(ranchMapContract)
    this.syncRanchStateSnapshot()
    services.telemetry.track('ranch_state_hydrated', {
      restoredCrops: restoredSnapshot.restoredCrops,
      restoredAnimals: restoredSnapshot.restoredAnimals,
      activeSeedId: this.activeSeedId,
    })
    this.unsubscribeInventoryChanges = services.onInventoryChanged(() => {
      this.refreshFtueObjectiveUi()
      this.refreshReturnObjectiveUi()
    })
    this.unsubscribeCurrencyChanges = services.onCurrencyChanged(() => {
      this.refreshUpgradeUi()
      this.refreshFtueObjectiveUi()
      this.refreshReturnObjectiveUi()
    })
    this.unsubscribeBarnChanges = services.onBarnStateChanged(() => {
      this.refreshFtueObjectiveUi()
      this.refreshReturnObjectiveUi()
    })
    this.unsubscribeExpansionChanges = services.onExpansionStateChanged((snapshot) => {
      this.expansionState = snapshot
      this.refreshExpansionGatedVisuals()
      this.updateInteractionState(ranchMapContract)
      this.refreshFtueObjectiveUi()
      this.refreshReturnObjectiveUi()
    })
    this.unsubscribeUpgradeChanges = services.onUpgradeStateChanged(() => {
      this.refreshUpgradeUi()
    })
    this.unsubscribeFtueStateChanges = services.onFtueStateChanged((state) => {
      this.refreshFtueObjectiveUi(state)
    })
    this.unsubscribeReturnObjectiveChanges = services.onReturnObjectiveStateChanged((state) => {
      this.refreshReturnObjectiveUi(state)
    })
    document.addEventListener('visibilitychange', this.visibilityChangeHandler)
    window.addEventListener('focus', this.focusHandler)

    this.registry.set('tiny-ranch:ranch-map-contract', ranchMapContract)
    this.registry.set('tiny-ranch:ranch-map-spawn-tile', ranchMapContract.spawnTile)
    this.registry.set('tiny-ranch:ranch-map-zones', ranchMapContract.zones)
    this.registry.set('tiny-ranch:ranch-map-crop-plots', ranchMapContract.cropPlots)
    this.registry.set('tiny-ranch:ranch-map-collision-tiles', ranchMapContract.collisionTiles)

    this.game.events.emit('tiny-ranch:ranch-map-ready', ranchMapContract)
    services.telemetry.track('ranch_map_ready', {
      widthTiles: ranchMapContract.width,
      heightTiles: ranchMapContract.height,
      zones: ranchMapContract.zones.length,
      cropPlots: ranchMapContract.cropPlots.length,
      collisions: ranchMapContract.collisionTiles.length,
      landmarks: ranchMapContract.landmarks.length,
      decorations: ranchMapContract.spritePlacements.filter(
        (placement) => placement.key === 'tiny-ranch-decorations',
      ).length,
      spawnTile: `${ranchMapContract.spawnTile.x},${ranchMapContract.spawnTile.y}`,
    })
    services.telemetry.track('player_spawned', {
      scene: this.scene.key,
      tileX: ranchMapContract.spawnTile.x,
      tileY: ranchMapContract.spawnTile.y,
    })

    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeHandler)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeHandler)
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this)
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler)
      window.removeEventListener('focus', this.focusHandler)
      this.unsubscribeInventoryChanges?.()
      this.unsubscribeInventoryChanges = undefined
      this.unsubscribeCurrencyChanges?.()
      this.unsubscribeCurrencyChanges = undefined
      this.unsubscribeBarnChanges?.()
      this.unsubscribeBarnChanges = undefined
      this.unsubscribeExpansionChanges?.()
      this.unsubscribeExpansionChanges = undefined
      this.unsubscribeUpgradeChanges?.()
      this.unsubscribeUpgradeChanges = undefined
      this.unsubscribeFtueStateChanges?.()
      this.unsubscribeFtueStateChanges = undefined
      this.unsubscribeReturnObjectiveChanges?.()
      this.unsubscribeReturnObjectiveChanges = undefined
      this.syncRanchStateSnapshot()
      this.collisionTiles.clear()
      this.plantedCrops.forEach((crop) => {
        this.clearCropGrowthTimer(crop)
      })
      this.plantedCrops.clear()
      this.animalSlots.forEach((slot) => {
        this.clearAnimalProductionTimer(slot)
      })
      this.animalSlots.clear()
      this.animalSlotsByTileKey.clear()
      this.interactables.length = 0
      this.activeInteractable = null
      this.touchMoveTargetTile = null
      this.touchMoveTargetWorld = null
      this.touchMoveBlockedFrames = 0
      this.cropZone = null
      this.animalZone = null
      this.upgradeEntryLabels.clear()
      this.upgradePanelBg = undefined
      this.upgradePanelTitle = undefined
      this.upgradePanelHeight = 0
      this.ftueObjectiveLabel = undefined
      this.returnObjectiveLabel = undefined
      this.returnObjectiveClaimButton = undefined
      this.hasTrackedUpgradePanelView = false
      this.expansionState = null
      this.cropLayer = undefined
      if (this.touchMoveIndicator) {
        this.tweens.killTweensOf(this.touchMoveIndicator)
        this.touchMoveIndicator.destroy()
        this.touchMoveIndicator = undefined
      }
    })
  }

  update(_time: number, delta: number): void {
    this.updatePlayerMovement(ranchMapContract, delta)
    this.updateInteractionState(ranchMapContract)
    this.tryUpgradeHotkeys()
    this.tryClaimReturnObjectiveHotkey()
    this.tryInteract()
  }

  public getDebugUiSnapshot(): RanchSceneDebugUiSnapshot {
    return {
      ftueObjectiveVisible: this.ftueObjectiveLabel?.visible ?? false,
      ftueObjectiveText: this.ftueObjectiveLabel?.text ?? '',
      returnObjectiveVisible: this.returnObjectiveLabel?.visible ?? false,
      returnObjectiveText: this.returnObjectiveLabel?.text ?? '',
      returnObjectiveClaimButtonVisible: this.returnObjectiveClaimButton?.visible ?? false,
      returnObjectiveClaimButtonText: this.returnObjectiveClaimButton?.text ?? '',
    }
  }

  private drawBackdrop(): void {
    if (!this.backdrop) {
      return
    }

    const width = this.scale.width
    const height = this.scale.height
    this.backdrop.clear()
    this.backdrop.fillGradientStyle(0x132f24, 0x132f24, 0x0b1c16, 0x0b1c16, 1)
    this.backdrop.fillRect(0, 0, width, height)
    this.backdrop.fillStyle(0xf6bf5f, 0.08)
    this.backdrop.fillEllipse(width * 0.2, height * 0.22, width * 0.42, height * 0.18)
    this.backdrop.fillStyle(0x8dd6a0, 0.08)
    this.backdrop.fillEllipse(width * 0.78, height * 0.78, width * 0.5, height * 0.24)
  }

  private layoutMap(contract: RanchMapContract): void {
    if (!this.mapRoot) {
      return
    }

    const worldSize = getRanchMapWorldSize(contract)
    const availableWidth = Math.max(240, this.scale.width - SCENE_PADDING * 2)
    const availableHeight = Math.max(200, this.scale.height - HUD_SAFE_TOP - SCENE_PADDING)
    const fitScale = Math.min(availableWidth / worldSize.width, availableHeight / worldSize.height)
    const scale = Phaser.Math.Clamp(fitScale, 0.72, 2.25)

    const x = (this.scale.width - worldSize.width * scale) / 2
    const y = HUD_SAFE_TOP + (availableHeight - worldSize.height * scale) / 2

    this.mapRoot.setScale(scale)
    this.mapRoot.setPosition(x, y)
  }

  private layoutInteractionUi(): void {
    this.interactionPrompt?.setPosition(this.scale.width * 0.5, this.scale.height - 20)
    this.interactionFeedback?.setPosition(this.scale.width * 0.5, HUD_SAFE_TOP + 14)
  }

  private createUpgradeUi(): void {
    this.upgradePanelBg = this.add
      .rectangle(0, 0, 0, 0, 0x10241e, 0.88)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xf6bf5f, 0.45)
      .setDepth(125)

    this.upgradePanelTitle = this.add
      .text(0, 0, 'Upgrades', {
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '13px',
        color: '#f6bf5f',
      })
      .setDepth(126)

    upgradeIds.forEach((upgradeId) => {
      const label = this.add
        .text(0, 0, '', {
          fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
          fontSize: '11px',
          color: UPGRADE_LABEL_COLOR,
          lineSpacing: 2,
          wordWrap: {
            width: UPGRADE_PANEL_MAX_WIDTH - 24,
            useAdvancedWrap: true,
          },
        })
        .setDepth(126)
        .setInteractive({ useHandCursor: true })

      label.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
        label.setColor('#ffffff')
      })
      label.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        this.refreshUpgradeUi()
      })
      label.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        this.tryPurchaseUpgrade(upgradeId, 'pointer')
      })

      this.upgradeEntryLabels.set(upgradeId, label)
    })

    this.configureUpgradeUiInteractivity()
  }

  private configureUpgradeUiInteractivity(): void {
    const usePointerUpgradeControls = !this.inputPrefersTouch
    this.upgradeEntryLabels.forEach((entry) => {
      if (usePointerUpgradeControls) {
        entry.setInteractive({ useHandCursor: true })
        return
      }

      entry.disableInteractive()
    })
  }

  private layoutUpgradeUi(): void {
    const panelX = SCENE_PADDING
    const panelY = HUD_SAFE_TOP + 14
    const maxWidth = Math.max(220, Math.min(UPGRADE_PANEL_MAX_WIDTH, this.scale.width - 24))
    const entryWrapWidth = maxWidth - 24

    this.upgradePanelTitle?.setPosition(panelX + 8, panelY + 8)

    let cursorY = panelY + 30
    let widestEntry = this.upgradePanelTitle?.width ?? 0
    for (const upgradeId of upgradeIds) {
      const entry = this.upgradeEntryLabels.get(upgradeId)
      if (!entry) {
        continue
      }

      entry.setWordWrapWidth(entryWrapWidth, true)
      entry.setPosition(panelX + 8, cursorY)
      cursorY += entry.height + 6
      widestEntry = Math.max(widestEntry, entry.width)
    }

    const panelWidth = Math.min(maxWidth, Math.max(220, widestEntry + 20))
    this.upgradePanelHeight = Math.max(70, cursorY - panelY + 4)
    this.upgradePanelBg?.setPosition(panelX, panelY).setSize(panelWidth, this.upgradePanelHeight)
  }

  private getFtueObjectiveTopY(): number {
    const defaultTopY = HUD_SAFE_TOP + 58
    if (!this.upgradePanelBg || !this.upgradePanelBg.visible) {
      return defaultTopY
    }

    return Math.max(defaultTopY, this.upgradePanelBg.y + this.upgradePanelHeight + UPGRADE_PANEL_GAP)
  }

  private createFtueObjectiveUi(): void {
    this.ftueObjectiveLabel = this.add
      .text(0, 0, '', {
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '13px',
        color: FTUE_LABEL_COLOR,
        backgroundColor: FTUE_LABEL_BG,
        lineSpacing: 3,
      })
      .setPadding(10, 8, 10, 8)
      .setOrigin(0, 0)
      .setDepth(130)
      .setVisible(false)
  }

  private createReturnObjectiveUi(): void {
    this.returnObjectiveLabel = this.add
      .text(0, 0, '', {
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '13px',
        color: RETURN_OBJECTIVE_LABEL_COLOR,
        backgroundColor: RETURN_OBJECTIVE_LABEL_BG,
        lineSpacing: 3,
      })
      .setPadding(10, 8, 10, 8)
      .setOrigin(0, 0)
      .setDepth(131)
      .setVisible(false)

    this.returnObjectiveClaimButton = this.add
      .text(0, 0, 'Claim reward', {
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '12px',
        color: RETURN_OBJECTIVE_CLAIM_BUTTON_TEXT,
        backgroundColor: RETURN_OBJECTIVE_CLAIM_BUTTON_BG,
      })
      .setPadding(10, 6, 10, 6)
      .setOrigin(0, 0)
      .setDepth(132)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })

    this.returnObjectiveClaimButton.on(
      Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN,
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation()
        this.tryClaimReturnObjectiveReward('pointer')
      },
    )
  }

  private layoutFtueObjectiveUi(): void {
    if (!this.ftueObjectiveLabel) {
      return
    }

    const contentWidth = Math.max(180, Math.min(FTUE_LABEL_MAX_WIDTH, this.scale.width - 24))
    this.ftueObjectiveLabel
      .setPosition(SCENE_PADDING, this.getFtueObjectiveTopY())
      .setWordWrapWidth(contentWidth - 20, true)
  }

  private getReturnObjectiveTopY(): number {
    const fallbackTopY = this.getFtueObjectiveTopY()
    if (!this.ftueObjectiveLabel || !this.ftueObjectiveLabel.visible) {
      return fallbackTopY
    }

    return this.ftueObjectiveLabel.y + this.ftueObjectiveLabel.height + UPGRADE_PANEL_GAP
  }

  private layoutReturnObjectiveUi(): void {
    if (!this.returnObjectiveLabel) {
      return
    }

    const contentWidth = Math.max(200, Math.min(RETURN_OBJECTIVE_LABEL_MAX_WIDTH, this.scale.width - 24))
    this.returnObjectiveLabel
      .setPosition(SCENE_PADDING, this.getReturnObjectiveTopY())
      .setWordWrapWidth(contentWidth - 20, true)

    if (!this.returnObjectiveClaimButton) {
      return
    }

    this.returnObjectiveClaimButton.setPosition(
      SCENE_PADDING + 10,
      this.returnObjectiveLabel.y + this.returnObjectiveLabel.height + 6,
    )
  }

  private refreshFtueObjectiveUi(ftueState?: FtueStateSnapshot): void {
    if (!this.ftueObjectiveLabel) {
      return
    }

    const services = getGameServices(this)
    const activeFtueState = ftueState ?? services.getFtueStateSnapshot()
    const objectiveText = this.buildFtueObjectiveText(activeFtueState)

    if (objectiveText === null) {
      this.ftueObjectiveLabel.setVisible(false)
      this.layoutReturnObjectiveUi()
      return
    }

    this.ftueObjectiveLabel.setText(objectiveText).setVisible(true)
    this.layoutReturnObjectiveUi()
  }

  private buildFtueObjectiveText(state: FtueStateSnapshot): string | null {
    if (!state.enabled || ftueConfig.steps.length === 0) {
      return null
    }

    if (state.currentStep === null) {
      return this.buildBarnHandoffObjectiveText(state.barnHandoff)
    }

    const currentStep = getFtueStepConfig(state.currentStep)
    const stepIndex = getFtueStepIndex(state.currentStep)
    const inputHint = this.inputPrefersTouch ? currentStep.touchHint : currentStep.keyboardHint

    return `Objective ${stepIndex + 1}/${ftueConfig.steps.length}\n${currentStep.title}\n${inputHint}`
  }

  private buildBarnHandoffObjectiveText(handoff: BarnHandoffStateSnapshot): string | null {
    if (!handoff.enabled || !handoff.isVisible || !handoff.targetRecipeLabel) {
      return null
    }

    return [
      'Barn objective',
      ftueConfig.barnHandoff.title,
      this.buildBarnHandoffNextActionText(handoff),
    ].join('\n')
  }

  private buildBarnHandoffNextActionText(handoff: BarnHandoffStateSnapshot): string {
    if (handoff.nextAction === 'completed') {
      return ftueConfig.barnHandoff.completedHint
    }

    return this.buildBarnObjectiveProgressHint(handoff)
  }

  private buildBarnObjectiveProgressHint(handoff: BarnHandoffStateSnapshot): string {
    const recipeLabel = handoff.targetRecipeLabel ?? 'Barn batch'
    if (!handoff.requiredZoneUnlocked) {
      return ftueConfig.barnHandoff.lockedHint
    }

    if (handoff.readyJobCount > 0) {
      return `Claim the ready ${recipeLabel} output in the Barn.`
    }

    if (handoff.activeJobCount > 0) {
      return `Wait for ${recipeLabel} to finish in the Barn.`
    }

    if (handoff.missingInputs.length > 0) {
      const missingLine = handoff.missingInputs
        .map((item) => {
          const missingQuantity = Math.max(0, item.requiredQuantity - item.availableQuantity)
          return `${this.formatInventoryItemLabel(item.itemId)} x${missingQuantity}`
        })
        .join(', ')

      return `${ftueConfig.barnHandoff.missingInputHint} Need ${missingLine}.`
    }

    if (handoff.missingCoins > 0) {
      return `Earn ${handoff.missingCoins} more coin${handoff.missingCoins === 1 ? '' : 's'} for ${recipeLabel}.`
    }

    const openBarnHint = this.inputPrefersTouch
      ? ftueConfig.barnHandoff.touchOpenBarnHint
      : ftueConfig.barnHandoff.keyboardOpenBarnHint
    return `${ftueConfig.barnHandoff.readyHint} ${openBarnHint}`
  }

  private refreshReturnObjectiveUi(state?: ReturnObjectiveStateSnapshot): void {
    if (!this.returnObjectiveLabel || !this.returnObjectiveClaimButton) {
      return
    }

    const services = getGameServices(this)
    const activeState = state ?? services.getReturnObjectiveStateSnapshot()
    if (!activeState.objectiveLoopEnabled) {
      this.returnObjectiveLabel.setVisible(false)
      this.returnObjectiveClaimButton.setVisible(false).disableInteractive()
      return
    }

    const objectiveText = this.buildReturnObjectiveText(activeState)

    if (objectiveText === null) {
      this.returnObjectiveLabel.setVisible(false)
      this.returnObjectiveClaimButton.setVisible(false).disableInteractive()
      return
    }

    this.returnObjectiveLabel.setText(objectiveText).setVisible(true)
    const canClaim = activeState.isCompleted && !activeState.isClaimed
    const claimButtonLabel = canClaim
      ? `Claim +${activeState.claimRewardAmount} coins`
      : 'Claim reward (locked)'
    const claimButtonBg = canClaim
      ? RETURN_OBJECTIVE_CLAIM_BUTTON_BG_READY
      : RETURN_OBJECTIVE_CLAIM_BUTTON_BG
    this.returnObjectiveClaimButton
      .setText(claimButtonLabel)
      .setStyle({
        backgroundColor: claimButtonBg,
      })
      .setAlpha(canClaim ? 1 : 0.7)
      .setVisible(true)

    if (canClaim) {
      this.returnObjectiveClaimButton.setInteractive({ useHandCursor: true })
    } else {
      this.returnObjectiveClaimButton.disableInteractive()
    }

    this.layoutReturnObjectiveUi()
  }

  private buildReturnObjectiveText(state: ReturnObjectiveStateSnapshot): string | null {
    if (!state.objectiveLoopEnabled || !state.activeObjectiveId || !state.title || !state.metric) {
      return null
    }

    const metricLabel =
      state.metric === 'harvest_count'
        ? 'Harvest progress'
        : state.metric === 'sell_value'
          ? 'Sell value progress'
          : 'Barn claim progress'
    const statusLabel = state.isCompleted ? 'Complete: claim your reward.' : 'In progress.'
    const rewardDetail =
      state.streakBonusEnabled && state.streakRewardBonusAmount > 0
        ? `Claim reward: +${state.claimRewardAmount} coins (base +${state.rewardAmount}, streak +${state.streakRewardBonusAmount})`
        : `Claim reward: +${state.claimRewardAmount} coins`
    const barnActionLine = this.buildReturnObjectiveBarnActionText(state)

    if (!state.streakBonusEnabled) {
      return [
        'Return objective',
        state.title,
        `${metricLabel}: ${state.progressValue}/${state.targetValue}`,
        barnActionLine,
        'Streak bonus: disabled for this rollout.',
        rewardDetail,
        statusLabel,
      ]
        .filter((line): line is string => typeof line === 'string' && line.length > 0)
        .join('\n')
    }

    const streakWindowHours = Math.max(1, Math.round(state.streakGraceWindowMs / (60 * 60 * 1000)))
    const streakLabel =
      state.streakTier > 0
        ? `Streak: Tier ${state.streakTier}/${state.streakMaxTier} (claim within ${streakWindowHours}h).`
        : `Streak: none yet (claim within ${streakWindowHours}h to build one).`
    const nextTierLabel =
      state.nextStreakTier > state.streakTier
        ? `Next tier ${state.nextStreakTier} preview: +${state.nextClaimRewardAmount} coins`
        : `Max streak tier preview: +${state.nextClaimRewardAmount} coins`

    return [
      'Return objective',
      state.title,
      `${metricLabel}: ${state.progressValue}/${state.targetValue}`,
      barnActionLine,
      streakLabel,
      rewardDetail,
      nextTierLabel,
      statusLabel,
    ]
      .filter((line): line is string => typeof line === 'string' && line.length > 0)
      .join('\n')
  }

  private buildReturnObjectiveBarnActionText(
    state: ReturnObjectiveStateSnapshot,
  ): string | null {
    if (state.metric !== 'barn_claim_count' || state.isCompleted) {
      return null
    }

    const services = getGameServices(this)
    const handoff = services.getBarnHandoffStateSnapshot()
    if (!handoff.enabled) {
      return 'Next: open Barn and process a batch.'
    }

    return `Next: ${this.buildBarnObjectiveProgressHint(handoff)}`
  }

  private buildRanchStateSnapshot(): RanchStateSnapshot {
    const crops = [...this.plantedCrops.values()]
      .map((crop) => ({
        seedId: crop.seedId,
        tileX: crop.tileX,
        tileY: crop.tileY,
        plantedAtEpochMs: crop.plantedAtEpochMs,
        stageIndex: crop.stageIndex,
      }))
      .sort((left, right) => {
        const yDiff = left.tileY - right.tileY
        if (yDiff !== 0) {
          return yDiff
        }

        return left.tileX - right.tileX
      })

    const animals = [...this.animalSlots.values()]
      .map((slot) => ({
        id: slot.id,
        configId: slot.configId,
        tileX: slot.tileX,
        tileY: slot.tileY,
        isActive: slot.isActive,
        isFed: slot.isFed,
        hasProductReady: slot.hasProductReady,
        cycleStartedAtEpochMs: slot.cycleStartedAtEpochMs,
        nextProductAtEpochMs: slot.nextProductAtEpochMs,
      }))
      .sort((left, right) => left.id.localeCompare(right.id))

    return {
      activeSeedId: this.activeSeedId,
      crops,
      animals,
    }
  }

  private syncRanchStateSnapshot(): void {
    const services = getGameServices(this)
    services.setRanchStateSnapshot(this.buildRanchStateSnapshot())
  }

  private hydrateRanchStateSnapshot(
    contract: RanchMapContract,
  ): { restoredCrops: number; restoredAnimals: number } {
    const services = getGameServices(this)
    const snapshot = services.getRanchStateSnapshot()

    this.activeSeedId = snapshot.activeSeedId

    let restoredCrops = 0
    snapshot.crops.forEach((cropState) => {
      if (this.restoreCropFromSnapshot(cropState, contract)) {
        restoredCrops += 1
      }
    })
    this.syncCropGrowthFromClock()

    let restoredAnimals = 0
    snapshot.animals.forEach((animalState) => {
      if (this.restoreAnimalFromSnapshot(animalState)) {
        restoredAnimals += 1
      }
    })
    this.syncAnimalProductionFromClock()

    return {
      restoredCrops,
      restoredAnimals,
    }
  }

  private restoreCropFromSnapshot(
    cropState: RanchStateSnapshot['crops'][number],
    contract: RanchMapContract,
  ): boolean {
    if (!this.cropLayer) {
      return false
    }

    if (!this.isTileInBounds(cropState.tileX, cropState.tileY, contract)) {
      return false
    }

    if (!this.cropZone || !this.isTileWithinRect(cropState.tileX, cropState.tileY, this.cropZone)) {
      return false
    }

    if (!this.isZoneUnlocked('crop_area')) {
      return false
    }

    const tileKey = this.createTileKey(cropState.tileX, cropState.tileY)
    if (this.collisionTiles.has(tileKey) || this.plantedCrops.has(tileKey)) {
      return false
    }

    if (this.plantedCrops.size >= this.getExpansionStateSnapshot().unlocks.cropTileCapacity) {
      return false
    }

    const seedConfig = getCropSeedConfig(cropState.seedId)
    const stageIndex = Phaser.Math.Clamp(cropState.stageIndex, 0, seedConfig.stageFrames.length - 1)
    const sprite = this.add
      .image(
        cropState.tileX * contract.tileSize,
        cropState.tileY * contract.tileSize,
        'tiny-ranch-crops',
        seedConfig.stageFrames[stageIndex],
      )
      .setOrigin(0)
      .setDisplaySize(contract.tileSize, contract.tileSize)
    this.cropLayer.add(sprite)

    this.plantedCrops.set(tileKey, {
      seedId: cropState.seedId,
      tileX: cropState.tileX,
      tileY: cropState.tileY,
      plantedAtEpochMs: cropState.plantedAtEpochMs,
      stageIndex,
      nextStageTimeoutId: null,
      sprite,
    })

    return true
  }

  private restoreAnimalFromSnapshot(animalState: RanchStateSnapshot['animals'][number]): boolean {
    const slot = this.animalSlots.get(animalState.id)
    if (!slot) {
      return false
    }

    if (
      slot.configId !== animalState.configId ||
      slot.tileX !== animalState.tileX ||
      slot.tileY !== animalState.tileY
    ) {
      return false
    }

    this.clearAnimalProductionTimer(slot)
    slot.isActive = animalState.isActive
    slot.isFed = animalState.isFed
    slot.hasProductReady = animalState.hasProductReady
    slot.cycleStartedAtEpochMs = animalState.cycleStartedAtEpochMs
    slot.nextProductAtEpochMs = animalState.nextProductAtEpochMs

    if (!slot.isActive) {
      slot.isFed = false
      slot.hasProductReady = false
      slot.cycleStartedAtEpochMs = null
      slot.nextProductAtEpochMs = null
    }

    if (slot.hasProductReady) {
      slot.isActive = true
      slot.nextProductAtEpochMs = null
    }

    if (slot.isActive && !slot.hasProductReady && slot.nextProductAtEpochMs === null) {
      slot.hasProductReady = true
    }

    this.updateAnimalSlotVisual(slot)
    if (slot.isActive && !slot.hasProductReady && slot.nextProductAtEpochMs !== null) {
      this.scheduleAnimalProduction(slot)
    }

    return true
  }

  private isTileInBounds(tileX: number, tileY: number, contract: RanchMapContract): boolean {
    return tileX >= 0 && tileY >= 0 && tileX < contract.width && tileY < contract.height
  }

  private configureInput(): void {
    const keyboard = this.input.keyboard
    if (!keyboard) {
      return
    }

    this.cursors = keyboard.createCursorKeys()
    this.moveUpKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W)
    this.moveDownKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S)
    this.moveLeftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A)
    this.moveRightKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    this.interactKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E)
    this.interactAltKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.upgradeHotkeyOne = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE)
    this.upgradeHotkeyTwo = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO)
    this.upgradeHotkeyThree = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE)
    this.claimObjectiveHotkey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C)
  }

  private configurePointerInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this)
  }

  private isTouchInputPreferred(): boolean {
    return this.game.device.input.touch || this.scale.width <= 768
  }

  private createPlayer(contract: RanchMapContract): void {
    if (!this.mapRoot) {
      return
    }

    this.ensurePlayerAnimations()

    const spawnX = (contract.spawnTile.x + 0.5) * contract.tileSize
    const spawnY = (contract.spawnTile.y + 0.5) * contract.tileSize
    this.player = this.add
      .sprite(spawnX, spawnY, 'tiny-ranch-characters', 0)
      .setDisplaySize(contract.tileSize, contract.tileSize)
      .setOrigin(0.5, 0.5)

    this.mapRoot.add(this.player)
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const tile = this.getTileFromPointer(pointer, ranchMapContract)
    if (!tile) {
      if (this.isTouchMovementPointer(pointer) && this.touchMoveTargetWorld) {
        this.clearTouchMoveTarget()
        this.showInteractionFeedback('Movement canceled.', FEEDBACK_COLOR_DEFAULT)
      }
      return
    }

    if (this.tryHandlePointerInteraction(tile.x, tile.y, ranchMapContract)) {
      this.clearTouchMoveTarget()
      return
    }

    if (this.isTouchMovementPointer(pointer)) {
      this.tryQueueTouchMoveTarget(tile.x, tile.y, ranchMapContract)
    }
  }

  private tryHandlePointerInteraction(
    tileX: number,
    tileY: number,
    contract: RanchMapContract,
  ): boolean {
    const utilityWellZone = contract.zones.find((zone) => zone.id === 'utility_well')
    if (utilityWellZone && this.isTileWithinRect(tileX, tileY, utilityWellZone)) {
      this.tryPurchaseExpansion('pointer', UTILITY_WELL_ZONE_INTERACTABLE_ID)
      return true
    }

    if (this.animalZone && this.isTileWithinRect(tileX, tileY, this.animalZone)) {
      if (!this.isZoneUnlocked('animal_pen')) {
        this.showInteractionFeedback(this.getLockedZonePrompt('animal_pen'), FEEDBACK_COLOR_ERROR)
        return true
      }

      this.tryAnimalActionAtTile(tileX, tileY, contract, 'pointer')
      return true
    }

    if (this.cropZone && this.isTileWithinRect(tileX, tileY, this.cropZone)) {
      if (!this.isZoneUnlocked('crop_area')) {
        this.showInteractionFeedback(this.getLockedZonePrompt('crop_area'), FEEDBACK_COLOR_ERROR)
        return true
      }

      this.tryCropActionAtTile(tileX, tileY, contract, 'pointer')
      return true
    }

    const economyZone = this.resolveEconomyZoneAtTile(tileX, tileY, contract)
    if (economyZone) {
      if (!this.isZoneUnlocked(economyZone.id)) {
        this.showInteractionFeedback(this.getLockedZonePrompt(economyZone.id), FEEDBACK_COLOR_ERROR)
        return true
      }

      this.trySellInventory(this.resolveSellPointId(`zone:${economyZone.id}`), 'pointer')
      return true
    }

    return false
  }

  private isTouchMovementPointer(pointer: Phaser.Input.Pointer): boolean {
    if (!this.inputPrefersTouch) {
      return false
    }

    if (pointer.wasTouch) {
      return true
    }

    const domEvent = pointer.event as unknown
    if (domEvent && typeof domEvent === 'object') {
      const pointerLikeEvent = domEvent as { pointerType?: unknown }
      if (typeof pointerLikeEvent.pointerType === 'string') {
        return pointerLikeEvent.pointerType.toLowerCase() === 'touch'
      }

      if ('changedTouches' in pointerLikeEvent) {
        return true
      }
    }

    return this.game.device.input.touch
  }

  private tryQueueTouchMoveTarget(tileX: number, tileY: number, contract: RanchMapContract): void {
    if (
      this.touchMoveTargetTile &&
      this.touchMoveTargetTile.x === tileX &&
      this.touchMoveTargetTile.y === tileY
    ) {
      this.clearTouchMoveTarget()
      this.showInteractionFeedback('Movement canceled.', FEEDBACK_COLOR_DEFAULT)
      return
    }

    if (!this.isTileWalkableForPlayer(tileX, tileY, contract)) {
      this.flashTouchMoveIndicator(tileX, tileY, true)
      this.showInteractionFeedback('That tile is blocked. Tap open ground to move.', FEEDBACK_COLOR_ERROR)
      return
    }

    this.touchMoveTargetTile = { x: tileX, y: tileY }
    this.touchMoveTargetWorld = new Phaser.Math.Vector2(
      (tileX + 0.5) * contract.tileSize,
      (tileY + 0.5) * contract.tileSize,
    )
    this.touchMoveBlockedFrames = 0
    this.flashTouchMoveIndicator(tileX, tileY, false)
  }

  private getTileFromPointer(
    pointer: Phaser.Input.Pointer,
    contract: RanchMapContract,
  ): TilePosition | null {
    if (!this.mapRoot || this.mapRoot.scaleX === 0 || this.mapRoot.scaleY === 0) {
      return null
    }

    const localX = (pointer.x - this.mapRoot.x) / this.mapRoot.scaleX
    const localY = (pointer.y - this.mapRoot.y) / this.mapRoot.scaleY
    const tileX = Math.floor(localX / contract.tileSize)
    const tileY = Math.floor(localY / contract.tileSize)

    if (tileX < 0 || tileY < 0 || tileX >= contract.width || tileY >= contract.height) {
      return null
    }

    return { x: tileX, y: tileY }
  }

  private isTileWalkableForPlayer(tileX: number, tileY: number, contract: RanchMapContract): boolean {
    if (!this.isTileInBounds(tileX, tileY, contract)) {
      return false
    }

    if (this.collisionTiles.has(this.createTileKey(tileX, tileY))) {
      return false
    }

    const radius = contract.tileSize * PLAYER_COLLISION_RADIUS_FACTOR
    const worldX = (tileX + 0.5) * contract.tileSize
    const worldY = (tileY + 0.5) * contract.tileSize
    return !this.collidesAt(worldX, worldY, contract, radius)
  }

  private clearTouchMoveTarget(): void {
    this.touchMoveTargetTile = null
    this.touchMoveTargetWorld = null
    this.touchMoveBlockedFrames = 0

    if (!this.touchMoveIndicator) {
      return
    }

    this.tweens.killTweensOf(this.touchMoveIndicator)
    this.touchMoveIndicator.setVisible(false).setAlpha(1).setScale(1)
  }

  private flashTouchMoveIndicator(tileX: number, tileY: number, invalid: boolean): void {
    if (!this.touchMoveIndicator) {
      return
    }

    const indicator = this.touchMoveIndicator
    const centerX = (tileX + 0.5) * ranchMapContract.tileSize
    const centerY = (tileY + 0.5) * ranchMapContract.tileSize

    this.tweens.killTweensOf(indicator)
    indicator
      .setPosition(centerX, centerY)
      .setFillStyle(invalid ? TOUCH_MOVE_INVALID_COLOR : TOUCH_MOVE_TARGET_COLOR, invalid ? 0.28 : 0.2)
      .setStrokeStyle(
        1,
        invalid ? TOUCH_MOVE_INVALID_STROKE_COLOR : TOUCH_MOVE_TARGET_STROKE_COLOR,
        invalid ? 0.95 : 0.9,
      )
      .setVisible(true)
      .setAlpha(1)
      .setScale(1)

    if (invalid) {
      this.tweens.add({
        targets: indicator,
        alpha: 0,
        duration: 220,
        ease: 'Quad.easeOut',
        onComplete: () => {
          if (!this.touchMoveTargetTile) {
            indicator.setVisible(false).setAlpha(1).setScale(1)
            return
          }

          this.flashTouchMoveIndicator(this.touchMoveTargetTile.x, this.touchMoveTargetTile.y, false)
        },
      })
      return
    }

    this.tweens.add({
      targets: indicator,
      alpha: 0.58,
      scale: 1.08,
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  private resolveCropZone(contract: RanchMapContract): RanchZone | null {
    return contract.zones.find((zone) => zone.id === 'crop_area') ?? null
  }

  private resolveAnimalZone(contract: RanchMapContract): RanchZone | null {
    return contract.zones.find((zone) => zone.id === 'animal_pen') ?? null
  }

  private resolveEconomyZoneAtTile(
    tileX: number,
    tileY: number,
    contract: RanchMapContract,
  ): RanchZone | null {
    return (
      contract.zones.find(
        (zone) => zone.purpose === 'economy' && this.isTileWithinRect(tileX, tileY, zone),
      ) ?? null
    )
  }

  private getExpansionStateSnapshot(): ExpansionStateSnapshot {
    if (this.expansionState) {
      return this.expansionState
    }

    const snapshot = getGameServices(this).getExpansionStateSnapshot()
    this.expansionState = snapshot
    return snapshot
  }

  private refreshExpansionGatedVisuals(): void {
    this.animalSlots.forEach((slot) => {
      this.updateAnimalSlotVisual(slot)
    })
  }

  private isZoneUnlocked(zoneId: RanchZone['id']): boolean {
    return this.getExpansionStateSnapshot().unlocks.unlockedZoneIds.includes(zoneId)
  }

  private getZoneIdForInteractable(interactableId: string): RanchZone['id'] | null {
    if (interactableId === SHIPPING_CRATE_LANDMARK_INTERACTABLE_ID) {
      return 'shipping_crate'
    }
    if (interactableId === MARKET_STALL_LANDMARK_INTERACTABLE_ID) {
      return 'market_stall'
    }
    if (interactableId === UTILITY_WELL_LANDMARK_INTERACTABLE_ID) {
      return 'utility_well'
    }
    if (!interactableId.startsWith('zone:')) {
      return null
    }

    const zoneId = interactableId.slice('zone:'.length) as RanchZone['id']
    return ranchMapContract.zones.some((zone) => zone.id === zoneId) ? zoneId : null
  }

  private isExpansionPurchaseInteractableId(interactableId: string): boolean {
    return (
      interactableId === UTILITY_WELL_ZONE_INTERACTABLE_ID ||
      interactableId === UTILITY_WELL_LANDMARK_INTERACTABLE_ID
    )
  }

  private isInteractableLockedByExpansion(interactableId: string): boolean {
    if (this.isExpansionPurchaseInteractableId(interactableId)) {
      return false
    }

    const zoneId = this.getZoneIdForInteractable(interactableId)
    return zoneId ? !this.isZoneUnlocked(zoneId) : false
  }

  private getLockedZonePrompt(zoneId: RanchZone['id']): string {
    const expansionState = this.getExpansionStateSnapshot()
    const unlocksOnNextTier = expansionState.nextUnlocks?.unlockedZoneIds.includes(zoneId) ?? false
    if (unlocksOnNextTier && expansionState.nextTier !== null && expansionState.nextCost !== null) {
      if (this.inputPrefersTouch) {
        return `Locked. Tap Utility Well to buy Tier ${expansionState.nextTier} (${expansionState.nextCost} coins).`
      }

      return `Locked. Press E/Space at Utility Well for Tier ${expansionState.nextTier} (${expansionState.nextCost} coins).`
    }

    return 'Locked by ranch expansion progression.'
  }

  private getOrderedAnimalSlots(): AnimalProductionSlot[] {
    return [...this.animalSlots.values()].sort((left, right) => {
      const yDiff = left.tileY - right.tileY
      if (yDiff !== 0) {
        return yDiff
      }

      const xDiff = left.tileX - right.tileX
      if (xDiff !== 0) {
        return xDiff
      }

      return left.id.localeCompare(right.id)
    })
  }

  private isAnimalSlotUnlockedByExpansion(slot: AnimalProductionSlot): boolean {
    if (!this.isZoneUnlocked('animal_pen')) {
      return false
    }

    const slotCapacity = this.getExpansionStateSnapshot().unlocks.animalSlotCapacity
    const orderedSlots = this.getOrderedAnimalSlots()
    const slotIndex = orderedSlots.findIndex((candidate) => candidate.id === slot.id)
    return slotIndex >= 0 && slotIndex < slotCapacity
  }

  private getUnlockedAnimalSlotCount(): number {
    const slotCapacity = this.getExpansionStateSnapshot().unlocks.animalSlotCapacity
    return Math.min(this.animalSlots.size, Math.max(0, slotCapacity))
  }

  private createTileKey(tileX: number, tileY: number): string {
    return `${tileX}:${tileY}`
  }

  private isTileWithinRect(tileX: number, tileY: number, rect: TileRect): boolean {
    return (
      tileX >= rect.x &&
      tileX < rect.x + rect.width &&
      tileY >= rect.y &&
      tileY < rect.y + rect.height
    )
  }

  private ensurePlayerAnimations(): void {
    const animations: Record<FacingDirection, number[]> = {
      down: [0, 1, 2],
      left: [3, 4, 5],
      right: [6, 7, 8],
      up: [9, 10, 11],
    }

    ;(Object.keys(animations) as FacingDirection[]).forEach((direction) => {
      const key = this.getWalkAnimationKey(direction)
      if (this.anims.exists(key)) {
        return
      }

      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers('tiny-ranch-characters', {
          frames: animations[direction],
        }),
        frameRate: 9,
        repeat: -1,
      })
    })
  }

  private getWalkAnimationKey(direction: FacingDirection): string {
    return `${PLAYER_ANIMATION_PREFIX}:walk:${direction}`
  }

  private getIdleFrame(direction: FacingDirection): number {
    if (direction === 'left') {
      return 4
    }
    if (direction === 'right') {
      return 7
    }
    if (direction === 'up') {
      return 10
    }

    return 1
  }

  private updatePlayerMovement(contract: RanchMapContract, deltaMs: number): void {
    if (!this.player) {
      return
    }

    const keyboardDirection = this.resolveKeyboardMovementDirection()
    if (keyboardDirection) {
      if (this.touchMoveTargetWorld) {
        this.clearTouchMoveTarget()
      }

      const distance = PLAYER_MOVE_SPEED * (deltaMs / 1000)
      this.movePlayerInDirection(contract, keyboardDirection, distance, 'keyboard')
      return
    }

    if (this.touchMoveTargetWorld) {
      this.updateTouchMoveStep(contract, deltaMs)
      return
    }

    this.setPlayerIdlePose()
  }

  private resolveKeyboardMovementDirection(): Phaser.Math.Vector2 | null {
    const moveLeft = this.isAnyKeyDown(this.cursors?.left, this.moveLeftKey)
    const moveRight = this.isAnyKeyDown(this.cursors?.right, this.moveRightKey)
    const moveUp = this.isAnyKeyDown(this.cursors?.up, this.moveUpKey)
    const moveDown = this.isAnyKeyDown(this.cursors?.down, this.moveDownKey)

    const axisX = Number(moveRight) - Number(moveLeft)
    const axisY = Number(moveDown) - Number(moveUp)

    if (axisX === 0 && axisY === 0) {
      return null
    }

    return new Phaser.Math.Vector2(axisX, axisY).normalize()
  }

  private updateTouchMoveStep(contract: RanchMapContract, deltaMs: number): void {
    if (!this.player || !this.touchMoveTargetWorld || !this.touchMoveTargetTile) {
      return
    }

    const remainingDirection = new Phaser.Math.Vector2(
      this.touchMoveTargetWorld.x - this.player.x,
      this.touchMoveTargetWorld.y - this.player.y,
    )
    const remainingDistance = remainingDirection.length()
    if (remainingDistance <= TOUCH_MOVE_ARRIVE_DISTANCE_PX) {
      this.player.setPosition(this.touchMoveTargetWorld.x, this.touchMoveTargetWorld.y)
      this.clearTouchMoveTarget()
      this.setPlayerIdlePose()
      return
    }

    const maxDistance = PLAYER_MOVE_SPEED * (deltaMs / 1000)
    const stepDistance = Math.min(maxDistance, remainingDistance)
    const moved = this.movePlayerInDirection(contract, remainingDirection, stepDistance, 'touch')
    if (moved) {
      this.touchMoveBlockedFrames = 0
      if (!this.touchMoveTargetWorld) {
        this.setPlayerIdlePose()
        return
      }

      const remainingAfterStep = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        this.touchMoveTargetWorld.x,
        this.touchMoveTargetWorld.y,
      )
      if (remainingAfterStep <= TOUCH_MOVE_ARRIVE_DISTANCE_PX) {
        this.player.setPosition(this.touchMoveTargetWorld.x, this.touchMoveTargetWorld.y)
        this.clearTouchMoveTarget()
        this.setPlayerIdlePose()
      }
      return
    }

    this.touchMoveBlockedFrames += 1
    if (this.touchMoveBlockedFrames < TOUCH_MOVE_BLOCKED_FRAMES_THRESHOLD) {
      return
    }

    const blockedTarget = this.touchMoveTargetTile
    this.clearTouchMoveTarget()
    if (blockedTarget) {
      this.flashTouchMoveIndicator(blockedTarget.x, blockedTarget.y, true)
    }
    this.showInteractionFeedback('Path is blocked. Tap another tile.', FEEDBACK_COLOR_ERROR)
    this.setPlayerIdlePose()
  }

  private movePlayerInDirection(
    contract: RanchMapContract,
    direction: Phaser.Math.Vector2,
    distance: number,
    source: MovementInputSource,
  ): boolean {
    if (!this.player) {
      return false
    }

    if (!Number.isFinite(distance) || distance <= 0 || direction.lengthSq() === 0) {
      return false
    }

    const normalizedDirection = direction.clone().normalize()
    this.playerFacing = this.resolveFacing(normalizedDirection.x, normalizedDirection.y)
    const animationKey = this.getWalkAnimationKey(this.playerFacing)
    if (this.player.anims.currentAnim?.key !== animationKey) {
      this.player.play(animationKey, true)
    }

    const worldSize = getRanchMapWorldSize(contract)
    const radius = contract.tileSize * PLAYER_COLLISION_RADIUS_FACTOR
    const previousX = this.player.x
    const previousY = this.player.y

    const targetX = Phaser.Math.Clamp(
      this.player.x + normalizedDirection.x * distance,
      radius,
      worldSize.width - radius,
    )
    const targetY = Phaser.Math.Clamp(
      this.player.y + normalizedDirection.y * distance,
      radius,
      worldSize.height - radius,
    )

    let resolvedX = targetX
    if (this.collidesAt(resolvedX, this.player.y, contract, radius)) {
      resolvedX = this.player.x
    }

    let resolvedY = targetY
    if (this.collidesAt(resolvedX, resolvedY, contract, radius)) {
      resolvedY = this.player.y
    }

    this.player.setPosition(resolvedX, resolvedY)
    const moved = resolvedX !== previousX || resolvedY !== previousY
    if (moved) {
      this.trackMoveMilestone(source, contract, resolvedX, resolvedY)
    }

    return moved
  }

  private trackMoveMilestone(
    source: MovementInputSource,
    contract: RanchMapContract,
    resolvedX: number,
    resolvedY: number,
  ): void {
    const services = getGameServices(this)
    services.firstSessionFunnel.trackMove({
      scene: this.scene.key,
      source,
      tileX: Math.floor(resolvedX / contract.tileSize),
      tileY: Math.floor(resolvedY / contract.tileSize),
    })
  }

  private setPlayerIdlePose(): void {
    if (!this.player) {
      return
    }

    this.player.anims.stop()
    this.player.setFrame(this.getIdleFrame(this.playerFacing))
  }

  private isAnyKeyDown(
    primary?: Phaser.Input.Keyboard.Key,
    alternate?: Phaser.Input.Keyboard.Key,
  ): boolean {
    return primary?.isDown === true || alternate?.isDown === true
  }

  private isJustPressed(key?: Phaser.Input.Keyboard.Key): boolean {
    return key ? Phaser.Input.Keyboard.JustDown(key) : false
  }

  private resolveFacing(axisX: number, axisY: number): FacingDirection {
    if (Math.abs(axisX) > Math.abs(axisY)) {
      return axisX > 0 ? 'right' : 'left'
    }
    if (axisY < 0) {
      return 'up'
    }

    return 'down'
  }

  private collidesAt(
    playerX: number,
    playerY: number,
    contract: RanchMapContract,
    radius: number,
  ): boolean {
    const leftTile = Math.floor((playerX - radius) / contract.tileSize)
    const rightTile = Math.floor((playerX + radius) / contract.tileSize)
    const topTile = Math.floor((playerY - radius) / contract.tileSize)
    const bottomTile = Math.floor((playerY + radius) / contract.tileSize)

    if (leftTile < 0 || topTile < 0 || rightTile >= contract.width || bottomTile >= contract.height) {
      return true
    }

    for (let tileY = topTile; tileY <= bottomTile; tileY += 1) {
      for (let tileX = leftTile; tileX <= rightTile; tileX += 1) {
        if (this.collisionTiles.has(`${tileX}:${tileY}`)) {
          return true
        }
      }
    }

    return false
  }

  private buildCollisionLookup(contract: RanchMapContract): void {
    this.collisionTiles.clear()
    contract.collisionTiles.forEach((tile) => {
      this.collisionTiles.add(`${tile.x}:${tile.y}`)
    })
  }

  private buildInteractables(contract: RanchMapContract): void {
    this.interactables.length = 0

    contract.zones.forEach((zone) => {
      this.interactables.push(this.createZoneInteractable(zone))
    })

    contract.landmarks.forEach((landmark) => {
      this.interactables.push(this.createLandmarkInteractable(landmark))
    })
  }

  private createZoneInteractable(zone: RanchZone): RanchInteractable {
    return {
      id: `zone:${zone.id}`,
      label: zone.label,
      type: 'zone',
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
    }
  }

  private createLandmarkInteractable(landmark: RanchLandmark): RanchInteractable {
    return {
      id: `landmark:${landmark.id}`,
      label: this.formatLandmarkLabel(landmark.id),
      type: 'landmark',
      x: landmark.x,
      y: landmark.y,
      width: landmark.width,
      height: landmark.height,
    }
  }

  private formatLandmarkLabel(identifier: string): string {
    return identifier
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }

  private createInteractionHighlight(): void {
    if (!this.mapRoot) {
      return
    }

    this.interactionHighlight = this.add
      .rectangle(0, 0, 0, 0, 0xf6bf5f, 0.14)
      .setOrigin(0)
      .setStrokeStyle(1, 0xfff3cf, 0.9)
      .setVisible(false)

    this.mapRoot.add(this.interactionHighlight)
  }

  private createTouchMoveIndicator(): void {
    if (!this.mapRoot) {
      return
    }

    this.touchMoveIndicator = this.add
      .rectangle(
        ranchMapContract.tileSize * 0.5,
        ranchMapContract.tileSize * 0.5,
        ranchMapContract.tileSize,
        ranchMapContract.tileSize,
        TOUCH_MOVE_TARGET_COLOR,
        0.2,
      )
      .setOrigin(0.5)
      .setStrokeStyle(1, TOUCH_MOVE_TARGET_STROKE_COLOR, 0.9)
      .setDepth(8)
      .setVisible(false)
    this.mapRoot.add(this.touchMoveIndicator)
  }

  private createInteractionUi(): void {
    this.interactionPrompt = this.add
      .text(0, 0, '', {
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
        fontSize: '12px',
        color: '#f4efe3',
        backgroundColor: '#10241ecc',
      })
      .setPadding(8, 4, 8, 4)
      .setOrigin(0.5, 1)
      .setDepth(120)
      .setVisible(false)

    this.interactionFeedback = this.add
      .text(0, 0, '', {
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '14px',
        color: '#f6bf5f',
      })
      .setOrigin(0.5, 0)
      .setDepth(120)
      .setVisible(false)
  }

  private refreshUpgradeUi(): void {
    const services = getGameServices(this)
    const upgradeState = services.getUpgradeStateSnapshot()
    const balance = services.getCurrencyBalance()

    upgradeIds.forEach((upgradeId, index) => {
      const entry = this.upgradeEntryLabels.get(upgradeId)
      if (!entry) {
        return
      }

      const config = getUpgradeConfig(upgradeId)
      const currentLevel = upgradeState.levels[upgradeId]
      const maxLevel = getUpgradeMaxLevel(upgradeId)
      const currentLevelConfig = getUpgradeLevelConfig(upgradeId, currentLevel)
      const nextLevelConfig = getNextUpgradeLevelConfig(upgradeId, currentLevel)
      const hotkeyLabel = this.getUpgradeHotkeyLabel(index)

      if (!nextLevelConfig) {
        const currentSummary = currentLevelConfig?.summary ?? 'All bonuses applied'
        entry
          .setText(
            `[${hotkeyLabel}] ${config.label} Lv${currentLevel}/${maxLevel}\n${currentSummary} • MAX`,
          )
          .setColor('#8dd6a0')
        return
      }

      const canAfford = balance >= nextLevelConfig.cost
      const affordabilityHint = canAfford
        ? `Cost ${nextLevelConfig.cost} (ready)`
        : `Cost ${nextLevelConfig.cost} (need ${nextLevelConfig.cost - balance})`
      entry
        .setText(
          `[${hotkeyLabel}] ${config.label} Lv${currentLevel}/${maxLevel}\n${nextLevelConfig.summary} • ${affordabilityHint}`,
        )
        .setColor(canAfford ? '#c9f2d7' : UPGRADE_LABEL_COLOR)
    })

    this.layoutUpgradeUi()
    this.layoutFtueObjectiveUi()
    this.layoutReturnObjectiveUi()
  }

  private trackUpgradePanelViewed(): void {
    if (this.hasTrackedUpgradePanelView) {
      return
    }

    const services = getGameServices(this)
    services.telemetry.track('upgrade_viewed', {
      scene: this.scene.key,
      panel: 'ranch_hud',
      upgradeCount: upgradeIds.length,
      balance: services.getCurrencyBalance(),
      eventTimestampMs: Date.now(),
    })
    this.hasTrackedUpgradePanelView = true
  }

  private getUpgradeHotkeyLabel(index: number): string {
    if (index === 0) {
      return '1'
    }
    if (index === 1) {
      return '2'
    }
    if (index === 2) {
      return '3'
    }

    return '-'
  }

  private tryUpgradeHotkeys(): void {
    this.tryPurchaseUpgradeByKey(0, this.upgradeHotkeyOne)
    this.tryPurchaseUpgradeByKey(1, this.upgradeHotkeyTwo)
    this.tryPurchaseUpgradeByKey(2, this.upgradeHotkeyThree)
  }

  private tryClaimReturnObjectiveHotkey(): void {
    if (!this.isJustPressed(this.claimObjectiveHotkey)) {
      return
    }

    this.tryClaimReturnObjectiveReward('keyboard')
  }

  private tryPurchaseUpgradeByKey(index: number, key?: Phaser.Input.Keyboard.Key): void {
    if (!key || !this.isJustPressed(key)) {
      return
    }

    const upgradeId = upgradeIds[index]
    if (!upgradeId) {
      return
    }

    this.tryPurchaseUpgrade(upgradeId, 'keyboard')
  }

  private tryPurchaseUpgrade(upgradeId: UpgradeId, inputSource: UpgradeInputSource): void {
    const services = getGameServices(this)
    const purchase = services.purchaseUpgrade(upgradeId, `ranch:${inputSource}`)
    const config = getUpgradeConfig(upgradeId)

    services.telemetry.track('upgrade_purchase_attempt', {
      upgradeId,
      inputSource,
      result: purchase.result,
      levelBefore: purchase.levelBefore,
      levelAfter: purchase.levelAfter,
      nextCost: purchase.nextCost,
      balance: purchase.balance,
      eventTimestampMs: Date.now(),
    })

    if (purchase.result === 'purchased') {
      const levelConfig = getUpgradeLevelConfig(upgradeId, purchase.levelAfter)
      const summary = levelConfig?.summary ?? 'Upgrade applied'
      this.showInteractionFeedback(
        `${config.label} Lv${purchase.levelAfter} purchased. ${summary}.`,
        FEEDBACK_COLOR_SUCCESS,
      )
      this.syncCropGrowthFromClock()
      this.refreshUpgradeUi()
      return
    }

    if (purchase.result === 'insufficient_funds') {
      const missingCoins = Math.max(1, (purchase.nextCost ?? 0) - purchase.balance)
      this.showInteractionFeedback(
        `Need ${missingCoins} more coin${missingCoins === 1 ? '' : 's'} for ${config.label}.`,
        FEEDBACK_COLOR_ERROR,
      )
      this.refreshUpgradeUi()
      return
    }

    this.showInteractionFeedback(`${config.label} is already maxed.`, FEEDBACK_COLOR_DEFAULT)
    this.refreshUpgradeUi()
  }

  private tryClaimReturnObjectiveReward(source: 'keyboard' | 'pointer'): void {
    const services = getGameServices(this)
    const claim = services.claimReturnObjectiveReward(`ranch:${source}`)

    if (!claim.state.objectiveLoopEnabled) {
      this.showInteractionFeedback(
        'Return objectives are disabled for this rollout.',
        FEEDBACK_COLOR_DEFAULT,
      )
      this.refreshReturnObjectiveUi(claim.state)
      return
    }

    if (claim.result === 'claimed') {
      this.showInteractionFeedback(
        `Objective claimed. +${claim.rewardAmount} coins.`,
        FEEDBACK_COLOR_SUCCESS,
      )
      this.refreshReturnObjectiveUi(claim.state)
      return
    }

    if (claim.result === 'not_completed') {
      this.showInteractionFeedback('Objective is not complete yet.', FEEDBACK_COLOR_ERROR)
      this.refreshReturnObjectiveUi(claim.state)
      return
    }

    if (claim.result === 'already_claimed') {
      this.showInteractionFeedback('Objective reward was already claimed.', FEEDBACK_COLOR_DEFAULT)
      this.refreshReturnObjectiveUi(claim.state)
      return
    }

    this.showInteractionFeedback('No return objective is active yet.', FEEDBACK_COLOR_DEFAULT)
    this.refreshReturnObjectiveUi(claim.state)
  }

  private formatInventoryItemLabel(itemId: string): string {
    return itemId
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
  }

  private updateInteractionState(contract: RanchMapContract): void {
    if (!this.player) {
      return
    }

    const maxDistance = contract.tileSize * INTERACTION_RANGE_TILES
    const target = this.getNearestInteractable(contract, this.player.x, this.player.y, maxDistance)

    this.activeInteractable = target

    if (!target) {
      this.interactionPrompt?.setVisible(false)
      this.interactionHighlight?.setVisible(false)
      return
    }

    this.interactionPrompt?.setText(this.getInteractionPrompt(target)).setVisible(true)

    const pixelX = target.x * contract.tileSize
    const pixelY = target.y * contract.tileSize
    const pixelWidth = target.width * contract.tileSize
    const pixelHeight = target.height * contract.tileSize
    this.interactionHighlight
      ?.setPosition(pixelX, pixelY)
      .setSize(pixelWidth, pixelHeight)
      .setVisible(true)
  }

  private getInteractionPrompt(target: RanchInteractable): string {
    if (this.isExpansionPurchaseInteractableId(target.id)) {
      return this.getExpansionPurchasePrompt()
    }

    const zoneId = this.getZoneIdForInteractable(target.id)
    if (zoneId && !this.isZoneUnlocked(zoneId)) {
      return this.getLockedZonePrompt(zoneId)
    }

    if (target.id === CROP_ZONE_INTERACTABLE_ID) {
      const seedConfig = getCropSeedConfig(this.activeSeedId)
      const cropCapacity = this.getExpansionStateSnapshot().unlocks.cropTileCapacity
      if (this.plantedCrops.size >= cropCapacity) {
        return `Crop capacity reached (${cropCapacity}/${cropCapacity}). Expand ranch to plant more.`
      }

      if (this.inputPrefersTouch) {
        return `Tap soil to plant ${seedConfig.label} or harvest mature crops`
      }

      return `Tap soil or press E/Space to plant ${seedConfig.label} / harvest mature crops`
    }

    if (target.id === ANIMAL_PEN_INTERACTABLE_ID) {
      const unlockedSlots = this.getUnlockedAnimalSlotCount()
      const slotSummary = `(${unlockedSlots}/${this.animalSlots.size} slots unlocked)`
      if (this.inputPrefersTouch) {
        return `Tap animals to activate, feed, or collect products ${slotSummary}`
      }

      return `Press E/Space near pen to activate, feed, or collect products ${slotSummary}`
    }

    if (this.isSellInteractableId(target.id)) {
      if (this.inputPrefersTouch) {
        return 'Tap to sell all inventory'
      }

      return 'Press E/Space to sell all inventory'
    }

    if (this.inputPrefersTouch) {
      return `Tap: ${target.label}`
    }

    return `Press E/Space: ${target.label}`
  }

  private getExpansionPurchasePrompt(): string {
    const services = getGameServices(this)
    const expansionState = this.getExpansionStateSnapshot()
    if (expansionState.nextTier === null || expansionState.nextCost === null) {
      return 'Utility Well: all ranch expansion tiers unlocked.'
    }

    const nextTierConfig = getExpansionTierConfig(expansionState.nextTier)
    const tierLabel = nextTierConfig?.label ?? `Tier ${expansionState.nextTier}`
    const balance = services.getCurrencyBalance()
    const affordability = balance >= expansionState.nextCost
      ? 'ready'
      : `need ${expansionState.nextCost - balance}`

    if (this.inputPrefersTouch) {
      return `Tap Utility Well to unlock ${tierLabel} (${expansionState.nextCost} coins, ${affordability}).`
    }

    return `Press E/Space at Utility Well for ${tierLabel} (${expansionState.nextCost} coins, ${affordability}).`
  }

  private isSellInteractableId(interactableId: string): boolean {
    return (
      interactableId === SHIPPING_CRATE_ZONE_INTERACTABLE_ID ||
      interactableId === MARKET_STALL_ZONE_INTERACTABLE_ID ||
      interactableId === SHIPPING_CRATE_LANDMARK_INTERACTABLE_ID ||
      interactableId === MARKET_STALL_LANDMARK_INTERACTABLE_ID
    )
  }

  private resolveSellPointId(interactableId: string): 'shipping_crate' | 'market_stall' | 'unknown' {
    if (
      interactableId === SHIPPING_CRATE_ZONE_INTERACTABLE_ID ||
      interactableId === SHIPPING_CRATE_LANDMARK_INTERACTABLE_ID
    ) {
      return 'shipping_crate'
    }

    if (
      interactableId === MARKET_STALL_ZONE_INTERACTABLE_ID ||
      interactableId === MARKET_STALL_LANDMARK_INTERACTABLE_ID
    ) {
      return 'market_stall'
    }

    return 'unknown'
  }

  private getNearestInteractable(
    contract: RanchMapContract,
    playerX: number,
    playerY: number,
    maxDistance: number,
  ): RanchInteractable | null {
    let selected: RanchInteractable | null = null
    let selectedDistance = Number.POSITIVE_INFINITY

    this.interactables.forEach((interactable) => {
      const rect = {
        x: interactable.x * contract.tileSize,
        y: interactable.y * contract.tileSize,
        width: interactable.width * contract.tileSize,
        height: interactable.height * contract.tileSize,
      }

      const distance = this.distanceToRect(playerX, playerY, rect)
      if (distance > maxDistance || distance >= selectedDistance) {
        return
      }

      selected = interactable
      selectedDistance = distance
    })

    return selected
  }

  private distanceToRect(
    pointX: number,
    pointY: number,
    rect: { x: number; y: number; width: number; height: number },
  ): number {
    const nearestX = Phaser.Math.Clamp(pointX, rect.x, rect.x + rect.width)
    const nearestY = Phaser.Math.Clamp(pointY, rect.y, rect.y + rect.height)
    return Phaser.Math.Distance.Between(pointX, pointY, nearestX, nearestY)
  }

  private getPlantingTileInFront(contract: RanchMapContract): TilePosition | null {
    if (!this.player) {
      return null
    }

    const playerTileX = Math.floor(this.player.x / contract.tileSize)
    const playerTileY = Math.floor(this.player.y / contract.tileSize)

    if (this.playerFacing === 'left') {
      return { x: playerTileX - 1, y: playerTileY }
    }
    if (this.playerFacing === 'right') {
      return { x: playerTileX + 1, y: playerTileY }
    }
    if (this.playerFacing === 'up') {
      return { x: playerTileX, y: playerTileY - 1 }
    }

    return { x: playerTileX, y: playerTileY + 1 }
  }

  private syncAnimalProductionFromClock(): void {
    this.animalSlots.forEach((slot) => {
      if (!slot.isActive || slot.hasProductReady || slot.nextProductAtEpochMs === null) {
        return
      }

      if (Date.now() >= slot.nextProductAtEpochMs) {
        this.markAnimalProductReady(slot, 'clock')
        return
      }

      this.scheduleAnimalProduction(slot)
    })
  }

  private tryAnimalActionAtTile(
    tileX: number,
    tileY: number,
    contract: RanchMapContract,
    inputSource: AnimalInputSource,
  ): boolean {
    if (!this.animalZone) {
      return false
    }

    const pointerOutsidePen =
      inputSource === 'pointer' && !this.isTileWithinRect(tileX, tileY, this.animalZone)
    if (pointerOutsidePen) {
      return false
    }

    if (!this.isZoneUnlocked('animal_pen')) {
      this.showInteractionFeedback(this.getLockedZonePrompt('animal_pen'), FEEDBACK_COLOR_ERROR)
      return false
    }

    this.syncAnimalProductionFromClock()
    const slot = this.resolveAnimalActionSlot(tileX, tileY, contract, inputSource)
    if (!slot) {
      this.showInteractionFeedback('No animal slot nearby.', FEEDBACK_COLOR_ERROR)
      return false
    }

    if (!this.isAnimalSlotUnlockedByExpansion(slot)) {
      this.showInteractionFeedback(
        'That animal slot is locked. Buy the next expansion tier at the Utility Well.',
        FEEDBACK_COLOR_ERROR,
      )
      return false
    }

    if (!slot.isActive) {
      const readyAtEpochMs = Date.now() + getAnimalProductionConfig(slot.configId).productionDurationMs
      slot.isActive = true
      slot.cycleStartedAtEpochMs = Date.now()
      slot.nextProductAtEpochMs = readyAtEpochMs
      slot.isFed = false
      slot.hasProductReady = false
      this.updateAnimalSlotVisual(slot)
      this.scheduleAnimalProduction(slot)
      this.showInteractionFeedback(
        `${getAnimalProductionConfig(slot.configId).label} activated.`,
        FEEDBACK_COLOR_SUCCESS,
      )
      this.trackAnimalSlotActivated(slot, inputSource)
      this.syncRanchStateSnapshot()
      return true
    }

    if (slot.hasProductReady) {
      const services = getGameServices(this)
      const config = getAnimalProductionConfig(slot.configId)
      const inventoryTotal = services.addInventoryItem(config.productItemId, 1)

      slot.hasProductReady = false
      slot.isFed = false
      slot.cycleStartedAtEpochMs = Date.now()
      slot.nextProductAtEpochMs = Date.now() + config.productionDurationMs
      this.updateAnimalSlotVisual(slot)
      this.scheduleAnimalProduction(slot)

      this.showInteractionFeedback(
        `Collected ${this.formatInventoryItemLabel(config.productItemId)} (+1).`,
        FEEDBACK_COLOR_SUCCESS,
      )
      this.trackAnimalProductCollected(slot, inputSource, inventoryTotal)
      this.syncRanchStateSnapshot()
      return true
    }

    if (!slot.isFed && slot.cycleStartedAtEpochMs !== null && slot.nextProductAtEpochMs !== null) {
      const config = getAnimalProductionConfig(slot.configId)
      slot.isFed = true
      const boostedReadyAtEpochMs = slot.cycleStartedAtEpochMs + config.fedProductionDurationMs
      slot.nextProductAtEpochMs = Math.min(slot.nextProductAtEpochMs, boostedReadyAtEpochMs)
      this.updateAnimalSlotVisual(slot)

      if (Date.now() >= slot.nextProductAtEpochMs) {
        this.markAnimalProductReady(slot, 'fed')
      } else {
        this.scheduleAnimalProduction(slot)
      }

      this.showInteractionFeedback(`Fed ${config.label}. Production boosted.`, FEEDBACK_COLOR_SUCCESS)
      this.trackAnimalFed(slot, inputSource)
      this.syncRanchStateSnapshot()
      return true
    }

    const remainingMs = Math.max(0, (slot.nextProductAtEpochMs ?? Date.now()) - Date.now())
    const config = getAnimalProductionConfig(slot.configId)
    this.showInteractionFeedback(
      `${config.label} is producing (${this.formatDurationSeconds(remainingMs)}s).`,
      FEEDBACK_COLOR_DEFAULT,
    )
    return false
  }

  private resolveAnimalActionSlot(
    tileX: number,
    tileY: number,
    contract: RanchMapContract,
    inputSource: AnimalInputSource,
  ): AnimalProductionSlot | null {
    const directMatch = this.animalSlotsByTileKey.get(this.createTileKey(tileX, tileY))
    if (directMatch) {
      return directMatch
    }

    const targetWorldX = (tileX + 0.5) * contract.tileSize
    const targetWorldY = (tileY + 0.5) * contract.tileSize

    if (inputSource === 'pointer') {
      return this.getNearestAnimalSlotByWorldPosition(targetWorldX, targetWorldY)
    }

    if (this.player) {
      return this.getNearestAnimalSlotByWorldPosition(this.player.x, this.player.y)
    }

    return this.getNearestAnimalSlotByWorldPosition(targetWorldX, targetWorldY)
  }

  private getNearestAnimalSlotByWorldPosition(
    worldX: number,
    worldY: number,
  ): AnimalProductionSlot | null {
    let selected: AnimalProductionSlot | null = null
    let selectedDistance = Number.POSITIVE_INFINITY

    this.animalSlots.forEach((slot) => {
      const centerX = slot.sprite.x + slot.sprite.displayWidth * 0.5
      const centerY = slot.sprite.y + slot.sprite.displayHeight * 0.5
      const distance = Phaser.Math.Distance.Between(worldX, worldY, centerX, centerY)
      if (distance >= selectedDistance) {
        return
      }

      selected = slot
      selectedDistance = distance
    })

    return selected
  }

  private markAnimalProductReady(slot: AnimalProductionSlot, source: 'clock' | 'fed' | 'timer'): void {
    if (slot.hasProductReady) {
      return
    }

    slot.hasProductReady = true
    slot.nextProductAtEpochMs = null
    this.clearAnimalProductionTimer(slot)
    this.updateAnimalSlotVisual(slot)
    this.trackAnimalProductReady(slot, source)
    this.syncRanchStateSnapshot()
  }

  private scheduleAnimalProduction(slot: AnimalProductionSlot): void {
    this.clearAnimalProductionTimer(slot)

    if (!slot.isActive || slot.hasProductReady || slot.nextProductAtEpochMs === null) {
      return
    }

    const delayMs = Math.max(0, slot.nextProductAtEpochMs - Date.now())
    const slotId = slot.id
    slot.nextProductTimeoutId = window.setTimeout(() => {
      const activeSlot = this.animalSlots.get(slotId)
      if (!activeSlot || activeSlot.hasProductReady) {
        return
      }

      this.markAnimalProductReady(activeSlot, 'timer')
    }, delayMs)
  }

  private clearAnimalProductionTimer(slot: AnimalProductionSlot): void {
    if (slot.nextProductTimeoutId === null) {
      return
    }

    window.clearTimeout(slot.nextProductTimeoutId)
    slot.nextProductTimeoutId = null
  }

  private updateAnimalSlotVisual(slot: AnimalProductionSlot): void {
    this.tweens.killTweensOf(slot.sprite)
    slot.sprite.setAlpha(1)
    slot.sprite.setScale(1)

    if (!this.isAnimalSlotUnlockedByExpansion(slot)) {
      slot.sprite.setTint(0x6f5f4a).setAlpha(0.25)
      return
    }

    if (!slot.isActive) {
      slot.sprite.setTint(0x9f8f79).setAlpha(0.35)
      return
    }

    if (slot.hasProductReady) {
      slot.sprite.setTint(0xf6bf5f)
      this.tweens.add({
        targets: slot.sprite,
        scale: 1.06,
        duration: 360,
        yoyo: true,
        repeat: -1,
      })
      return
    }

    if (slot.isFed) {
      slot.sprite.setTint(0x8dd6a0)
      return
    }

    slot.sprite.clearTint()
  }

  private formatDurationSeconds(durationMs: number): number {
    return Math.max(1, Math.ceil(durationMs / 1000))
  }

  private getUpgradeEffectsSnapshot(): { cropGrowthDurationMultiplier: number; sellPriceMultiplier: number } {
    const services = getGameServices(this)
    const snapshot = services.getUpgradeStateSnapshot()
    return snapshot.effects
  }

  private getEffectiveCropStageDurationsMs(seedId: CropSeedId): number[] {
    const seedConfig = getCropSeedConfig(seedId)
    const effects = this.getUpgradeEffectsSnapshot()
    const durationMultiplier = Phaser.Math.Clamp(effects.cropGrowthDurationMultiplier, 0.2, 5)

    return seedConfig.stageDurationsMs.map((durationMs) =>
      Math.max(1, Math.round(durationMs * durationMultiplier)),
    )
  }

  private resolveEffectiveSellUnitPrice(itemId: string): number {
    const baseUnitPrice = getItemSellPrice(itemId)
    const effects = this.getUpgradeEffectsSnapshot()
    const sellPriceMultiplier = Phaser.Math.Clamp(effects.sellPriceMultiplier, 0.2, 10)
    return Math.max(1, Math.round(baseUnitPrice * sellPriceMultiplier))
  }

  private advanceFtue(signal: FtueProgressSignal): void {
    const services = getGameServices(this)
    services.advanceFtue(signal)
  }

  private hasMatureCrop(): boolean {
    for (const crop of this.plantedCrops.values()) {
      if (this.isCropMature(crop)) {
        return true
      }
    }

    return false
  }

  private syncFtueProgressFromWorldState(): void {
    const services = getGameServices(this)
    const ftueState = services.getFtueStateSnapshot()
    if (!ftueState.enabled || ftueState.currentStep !== 'wait_for_growth') {
      return
    }

    if (!this.hasMatureCrop()) {
      return
    }

    this.advanceFtue('grow')
  }

  private syncCropGrowthFromClock(): void {
    this.plantedCrops.forEach((crop) => {
      this.syncCropGrowthStage(crop)
      this.scheduleNextCropGrowthStage(crop)
    })
    this.syncFtueProgressFromWorldState()
  }

  private syncCropGrowthStage(crop: PlantedCrop): void {
    const seedConfig = getCropSeedConfig(crop.seedId)
    const stageDurationsMs = this.getEffectiveCropStageDurationsMs(crop.seedId)
    const elapsedMs = Date.now() - crop.plantedAtEpochMs
    const resolvedStageIndex = this.resolveGrowthStageIndex(stageDurationsMs, elapsedMs)
    const finalStageIndex = Math.min(resolvedStageIndex, seedConfig.stageFrames.length - 1)

    if (finalStageIndex <= crop.stageIndex) {
      return
    }

    for (
      let stageIndex = crop.stageIndex + 1;
      stageIndex <= finalStageIndex;
      stageIndex += 1
    ) {
      this.trackCropStageAdvanced(crop, stageIndex - 1, stageIndex)
    }

    crop.stageIndex = finalStageIndex
    crop.sprite.setFrame(seedConfig.stageFrames[finalStageIndex])
    this.syncRanchStateSnapshot()
  }

  private resolveGrowthStageIndex(stageDurationsMs: readonly number[], elapsedMs: number): number {
    let stageIndex = 0
    let consumedMs = 0

    for (const durationMs of stageDurationsMs) {
      consumedMs += durationMs
      if (elapsedMs < consumedMs) {
        break
      }

      stageIndex += 1
    }

    return stageIndex
  }

  private resolveGrowthElapsedMsForStage(
    stageDurationsMs: readonly number[],
    stageIndex: number,
  ): number {
    let elapsedMs = 0

    for (let index = 0; index < stageIndex; index += 1) {
      elapsedMs += stageDurationsMs[index] ?? 0
    }

    return elapsedMs
  }

  private scheduleNextCropGrowthStage(crop: PlantedCrop): void {
    this.clearCropGrowthTimer(crop)

    const seedConfig = getCropSeedConfig(crop.seedId)
    const stageDurationsMs = this.getEffectiveCropStageDurationsMs(crop.seedId)
    const nextStageIndex = crop.stageIndex + 1
    if (nextStageIndex >= seedConfig.stageFrames.length) {
      return
    }

    const elapsedTargetMs = this.resolveGrowthElapsedMsForStage(stageDurationsMs, nextStageIndex)
    const delayMs = Math.max(0, elapsedTargetMs - (Date.now() - crop.plantedAtEpochMs))
    const tileKey = this.createTileKey(crop.tileX, crop.tileY)

    crop.nextStageTimeoutId = window.setTimeout(() => {
      const activeCrop = this.plantedCrops.get(tileKey)
      if (!activeCrop) {
        return
      }

      this.syncCropGrowthStage(activeCrop)
      this.scheduleNextCropGrowthStage(activeCrop)
    }, delayMs)
  }

  private clearCropGrowthTimer(crop: PlantedCrop): void {
    if (crop.nextStageTimeoutId === null) {
      return
    }

    window.clearTimeout(crop.nextStageTimeoutId)
    crop.nextStageTimeoutId = null
  }

  private isCropMature(crop: PlantedCrop): boolean {
    const seedConfig = getCropSeedConfig(crop.seedId)
    return crop.stageIndex >= seedConfig.stageFrames.length - 1
  }

  private tryCropActionAtTile(
    tileX: number,
    tileY: number,
    contract: RanchMapContract,
    inputSource: PlantInputSource,
  ): boolean {
    this.syncCropGrowthFromClock()

    const tileKey = this.createTileKey(tileX, tileY)
    const plantedCrop = this.plantedCrops.get(tileKey)
    if (!plantedCrop) {
      return this.tryPlantAtTile(tileX, tileY, contract, inputSource)
    }

    return this.tryHarvestCrop(plantedCrop, inputSource)
  }

  private validatePlantingTile(
    tileX: number,
    tileY: number,
    contract: RanchMapContract,
  ): PlantingValidationResult {
    if (tileX < 0 || tileY < 0 || tileX >= contract.width || tileY >= contract.height) {
      return 'out_of_bounds'
    }

    if (!this.cropZone || !this.isTileWithinRect(tileX, tileY, this.cropZone)) {
      return 'invalid_zone'
    }

    if (!this.isZoneUnlocked('crop_area')) {
      return 'zone_locked'
    }

    const tileKey = this.createTileKey(tileX, tileY)
    if (this.collisionTiles.has(tileKey)) {
      return 'blocked'
    }

    if (this.plantedCrops.has(tileKey)) {
      return 'occupied'
    }

    if (this.plantedCrops.size >= this.getExpansionStateSnapshot().unlocks.cropTileCapacity) {
      return 'capacity_locked'
    }

    return 'ok'
  }

  private tryPlantAtTile(
    tileX: number,
    tileY: number,
    contract: RanchMapContract,
    inputSource: PlantInputSource,
  ): boolean {
    const validation = this.validatePlantingTile(tileX, tileY, contract)
    if (validation !== 'ok') {
      this.showPlantingValidationFeedback(validation)
      this.trackPlantingAttempt(tileX, tileY, inputSource, validation)
      return false
    }

    if (!this.cropLayer) {
      this.trackPlantingAttempt(tileX, tileY, inputSource, 'no_layer')
      return false
    }

    const seedConfig = getCropSeedConfig(this.activeSeedId)
    const sprite = this.add
      .image(tileX * contract.tileSize, tileY * contract.tileSize, 'tiny-ranch-crops', seedConfig.stageFrames[0])
      .setOrigin(0)
      .setDisplaySize(contract.tileSize, contract.tileSize)
    this.cropLayer.add(sprite)

    const tileKey = this.createTileKey(tileX, tileY)
    const plantedCrop: PlantedCrop = {
      seedId: this.activeSeedId,
      tileX,
      tileY,
      plantedAtEpochMs: Date.now(),
      stageIndex: 0,
      nextStageTimeoutId: null,
      sprite,
    }
    this.plantedCrops.set(tileKey, plantedCrop)
    this.scheduleNextCropGrowthStage(plantedCrop)
    this.syncRanchStateSnapshot()

    this.showInteractionFeedback(`Planted ${seedConfig.label}.`, FEEDBACK_COLOR_SUCCESS)
    this.trackSeedPlanted(tileX, tileY, this.activeSeedId, inputSource)
    this.trackPlantingAttempt(tileX, tileY, inputSource, 'planted')
    return true
  }

  private tryHarvestCrop(crop: PlantedCrop, inputSource: PlantInputSource): boolean {
    if (!this.isCropMature(crop)) {
      this.showInteractionFeedback('That crop is still growing.', FEEDBACK_COLOR_ERROR)
      return false
    }

    const seedConfig = getCropSeedConfig(crop.seedId)
    const tileKey = this.createTileKey(crop.tileX, crop.tileY)
    this.clearCropGrowthTimer(crop)
    crop.sprite.destroy()
    this.plantedCrops.delete(tileKey)
    this.syncRanchStateSnapshot()

    const services = getGameServices(this)
    const inventoryTotal = services.addInventoryItem(seedConfig.yieldItemId, 1)

    this.showInteractionFeedback(
      `Harvested ${this.formatInventoryItemLabel(seedConfig.yieldItemId)} (+1).`,
      FEEDBACK_COLOR_SUCCESS,
    )
    this.trackCropHarvested(crop, inputSource, inventoryTotal)
    return true
  }

  private showPlantingValidationFeedback(
    validation: Exclude<PlantingValidationResult, 'ok'>,
  ): void {
    if (validation === 'invalid_zone') {
      this.showInteractionFeedback('Plant only inside the Crop Area.', FEEDBACK_COLOR_ERROR)
      return
    }

    if (validation === 'zone_locked') {
      this.showInteractionFeedback(this.getLockedZonePrompt('crop_area'), FEEDBACK_COLOR_ERROR)
      return
    }

    if (validation === 'capacity_locked') {
      const cropCapacity = this.getExpansionStateSnapshot().unlocks.cropTileCapacity
      this.showInteractionFeedback(
        `Crop capacity (${cropCapacity}) reached. Buy the next expansion tier at the Utility Well.`,
        FEEDBACK_COLOR_ERROR,
      )
      return
    }

    if (validation === 'occupied') {
      this.showInteractionFeedback('That tile is already planted.', FEEDBACK_COLOR_ERROR)
      return
    }

    if (validation === 'blocked') {
      this.showInteractionFeedback('That tile is blocked.', FEEDBACK_COLOR_ERROR)
      return
    }

    this.showInteractionFeedback('That tile is outside the ranch map.', FEEDBACK_COLOR_ERROR)
  }

  private trackPlantingAttempt(
    tileX: number,
    tileY: number,
    inputSource: PlantInputSource,
    result: Exclude<PlantingValidationResult, 'ok'> | 'planted' | 'no_layer',
  ): void {
    const services = getGameServices(this)
    const seedConfig = getCropSeedConfig(this.activeSeedId)
    const stageDurationsMs = this.getEffectiveCropStageDurationsMs(this.activeSeedId)
    const upgradeEffects = this.getUpgradeEffectsSnapshot()

    services.telemetry.track('crop_plant_attempt', {
      result,
      inputSource,
      seedId: this.activeSeedId,
      yieldItemId: seedConfig.yieldItemId,
      stageDurationsMs: stageDurationsMs.join(','),
      cropGrowthDurationMultiplier: upgradeEffects.cropGrowthDurationMultiplier,
      tileX,
      tileY,
    })
  }

  private trackSeedPlanted(
    tileX: number,
    tileY: number,
    seedId: CropSeedId,
    inputSource: PlantInputSource,
  ): void {
    const services = getGameServices(this)
    const seedConfig = getCropSeedConfig(seedId)

    services.telemetry.track('seed_planted', {
      cropType: seedConfig.yieldItemId,
      seedId,
      tileX,
      tileY,
      inputSource,
      eventTimestampMs: Date.now(),
    })
    services.firstSessionFunnel.trackPlant({
      scene: this.scene.key,
      source: inputSource,
      tileX,
      tileY,
      itemId: seedConfig.yieldItemId,
      quantity: 1,
    })
    this.advanceFtue('plant')
  }

  private trackCropStageAdvanced(crop: PlantedCrop, fromStage: number, toStage: number): void {
    const services = getGameServices(this)
    const seedConfig = getCropSeedConfig(crop.seedId)
    const isMature = toStage >= seedConfig.stageFrames.length - 1

    services.telemetry.track('crop_stage_advanced', {
      cropType: seedConfig.yieldItemId,
      seedId: crop.seedId,
      tileX: crop.tileX,
      tileY: crop.tileY,
      fromStage,
      toStage,
      isMature,
      eventTimestampMs: Date.now(),
    })

    if (isMature) {
      this.advanceFtue('grow')
    }
  }

  private trackCropHarvested(
    crop: PlantedCrop,
    inputSource: PlantInputSource,
    inventoryTotal: number,
  ): void {
    const services = getGameServices(this)
    const seedConfig = getCropSeedConfig(crop.seedId)

    services.telemetry.track('crop_harvested', {
      cropType: seedConfig.yieldItemId,
      seedId: crop.seedId,
      tileX: crop.tileX,
      tileY: crop.tileY,
      inputSource,
      quantity: 1,
      inventoryTotal,
      eventTimestampMs: Date.now(),
    })
    services.firstSessionFunnel.trackHarvest({
      scene: this.scene.key,
      source: inputSource,
      tileX: crop.tileX,
      tileY: crop.tileY,
      itemId: seedConfig.yieldItemId,
      quantity: 1,
      inventoryTotal,
    })
    services.progressReturnObjective('harvest_count', 1, `ranch:crop_harvest:${inputSource}`)
    this.advanceFtue('harvest')
  }

  private trackAnimalSlotActivated(slot: AnimalProductionSlot, inputSource: AnimalInputSource): void {
    const services = getGameServices(this)
    const config = getAnimalProductionConfig(slot.configId)

    services.telemetry.track('animal_slot_activated', {
      animalType: slot.configId,
      animalLabel: config.label,
      productItemId: config.productItemId,
      tileX: slot.tileX,
      tileY: slot.tileY,
      inputSource,
      productionDurationMs: config.productionDurationMs,
      fedProductionDurationMs: config.fedProductionDurationMs,
      eventTimestampMs: Date.now(),
    })
  }

  private trackAnimalFed(slot: AnimalProductionSlot, inputSource: AnimalInputSource): void {
    const services = getGameServices(this)
    const config = getAnimalProductionConfig(slot.configId)

    services.telemetry.track('animal_fed', {
      animalType: slot.configId,
      animalLabel: config.label,
      productItemId: config.productItemId,
      tileX: slot.tileX,
      tileY: slot.tileY,
      inputSource,
      eventTimestampMs: Date.now(),
    })
  }

  private trackAnimalProductReady(
    slot: AnimalProductionSlot,
    source: 'clock' | 'fed' | 'timer',
  ): void {
    const services = getGameServices(this)
    const config = getAnimalProductionConfig(slot.configId)

    services.telemetry.track('animal_product_ready', {
      animalType: slot.configId,
      animalLabel: config.label,
      productItemId: config.productItemId,
      tileX: slot.tileX,
      tileY: slot.tileY,
      source,
      isFed: slot.isFed,
      eventTimestampMs: Date.now(),
    })
  }

  private trackAnimalProductCollected(
    slot: AnimalProductionSlot,
    inputSource: AnimalInputSource,
    inventoryTotal: number,
  ): void {
    const services = getGameServices(this)
    const config = getAnimalProductionConfig(slot.configId)

    services.telemetry.track('animal_product_collected', {
      animalType: slot.configId,
      animalLabel: config.label,
      productItemId: config.productItemId,
      tileX: slot.tileX,
      tileY: slot.tileY,
      inputSource,
      quantity: 1,
      inventoryTotal,
      eventTimestampMs: Date.now(),
    })
  }

  private trySellInventory(
    sellPointId: 'shipping_crate' | 'market_stall' | 'unknown',
    inputSource: SellInputSource,
  ): boolean {
    const services = getGameServices(this)
    const sellPriceMultiplier = this.getUpgradeEffectsSnapshot().sellPriceMultiplier
    const orderFulfillment = services.fulfillBarnMarketOrders(
      `ranch:${sellPointId}:${inputSource}`,
    )
    const inventory = services.getInventorySnapshot()
    const saleCandidates = Object.entries(inventory).filter((entry) => entry[1] > 0)

    if (saleCandidates.length === 0 && orderFulfillment.fulfilledOrderCount === 0) {
      this.showInteractionFeedback('Inventory is empty. Nothing to sell.', FEEDBACK_COLOR_ERROR)
      this.trackInventorySold(
        'empty',
        sellPointId,
        inputSource,
        0,
        0,
        0,
        services.getCurrencyBalance(),
        sellPriceMultiplier,
      )
      return false
    }

    let soldLineItems = orderFulfillment.fulfilledOrderCount
    let soldQuantity = orderFulfillment.consumedQuantity
    let totalRevenue = orderFulfillment.totalPayout
    let latestBalance = orderFulfillment.balance

    saleCandidates.forEach(([itemId, quantity]) => {
      const unitPrice = this.resolveEffectiveSellUnitPrice(itemId)
      const sale = services.sellInventoryItem(
        itemId,
        quantity,
        unitPrice,
        `inventory_sale:${sellPointId}`,
      )

      soldLineItems += 1
      soldQuantity += sale.soldQuantity
      totalRevenue += sale.revenue
      latestBalance = sale.balance
    })

    const genericSoldQuantity = soldQuantity - orderFulfillment.consumedQuantity
    if (orderFulfillment.fulfilledOrderCount > 0 && genericSoldQuantity > 0) {
      this.showInteractionFeedback(
        `Fulfilled ${orderFulfillment.fulfilledOrderCount} market order${orderFulfillment.fulfilledOrderCount === 1 ? '' : 's'} and sold ${genericSoldQuantity} extra item${genericSoldQuantity === 1 ? '' : 's'} for ${totalRevenue} coins.`,
        FEEDBACK_COLOR_SUCCESS,
      )
    } else if (orderFulfillment.fulfilledOrderCount > 0) {
      this.showInteractionFeedback(
        `Fulfilled ${orderFulfillment.fulfilledOrderCount} market order${orderFulfillment.fulfilledOrderCount === 1 ? '' : 's'} for ${totalRevenue} coins.`,
        FEEDBACK_COLOR_SUCCESS,
      )
    } else {
      this.showInteractionFeedback(
        `Sold ${soldQuantity} item${soldQuantity === 1 ? '' : 's'} for ${totalRevenue} coins.`,
        FEEDBACK_COLOR_SUCCESS,
      )
    }
    this.trackInventorySold(
      'sold',
      sellPointId,
      inputSource,
      soldLineItems,
      soldQuantity,
      totalRevenue,
      latestBalance,
      sellPriceMultiplier,
    )
    return true
  }

  private trackInventorySold(
    result: 'sold' | 'empty',
    sellPointId: 'shipping_crate' | 'market_stall' | 'unknown',
    inputSource: SellInputSource,
    soldLineItems: number,
    soldQuantity: number,
    totalRevenue: number,
    balance: number,
    sellPriceMultiplier: number,
  ): void {
    const services = getGameServices(this)

    services.telemetry.track('inventory_sold', {
      result,
      sellPointId,
      inputSource,
      soldLineItems,
      soldQuantity,
      totalRevenue,
      balance,
      sellPriceMultiplier,
      eventTimestampMs: Date.now(),
    })
    if (result === 'sold') {
      services.progressReturnObjective('sell_value', totalRevenue, `ranch:inventory_sold:${inputSource}`)
      services.firstSessionFunnel.trackSale({
        scene: this.scene.key,
        source: inputSource,
        quantity: soldQuantity,
        inventoryTotal: 0,
        revenue: totalRevenue,
        balance,
      })
      this.advanceFtue('sell')
    }
  }

  private tryPurchaseExpansion(
    inputSource: ExpansionInputSource,
    interactableId: string,
  ): boolean {
    const services = getGameServices(this)
    const sourceContext = `ranch_scene:${inputSource}:${interactableId}`
    const purchase = services.purchaseNextExpansionTier(sourceContext)

    services.telemetry.track('expansion_interaction', {
      inputSource,
      interactableId,
      sourceContext,
      result: purchase.result,
      tierBefore: purchase.tierBefore,
      tierAfter: purchase.tierAfter,
      nextCost: purchase.nextCost,
      balance: purchase.balance,
      eventTimestampMs: Date.now(),
    })

    if (purchase.result === 'purchased') {
      const tierConfig = getExpansionTierConfig(purchase.tierAfter)
      const tierLabel = tierConfig?.label ?? `Tier ${purchase.tierAfter}`
      this.expansionState = services.getExpansionStateSnapshot()
      this.refreshExpansionGatedVisuals()
      this.updateInteractionState(ranchMapContract)
      this.showInteractionFeedback(
        `Unlocked ${tierLabel}. Ranch tier ${purchase.tierAfter} is now active.`,
        FEEDBACK_COLOR_SUCCESS,
      )
      return true
    }

    if (purchase.result === 'insufficient_funds') {
      const missingCoins = Math.max(1, (purchase.nextCost ?? 0) - purchase.balance)
      this.showInteractionFeedback(
        `Need ${missingCoins} more coin${missingCoins === 1 ? '' : 's'} for expansion.`,
        FEEDBACK_COLOR_ERROR,
      )
      return false
    }

    this.showInteractionFeedback('All ranch expansion tiers are already unlocked.', FEEDBACK_COLOR_DEFAULT)
    return false
  }

  private tryInteract(): void {
    if (!this.activeInteractable) {
      return
    }

    const pressedInteract = this.isJustPressed(this.interactKey) || this.isJustPressed(this.interactAltKey)
    if (!pressedInteract) {
      return
    }

    if (this.isExpansionPurchaseInteractableId(this.activeInteractable.id)) {
      this.tryPurchaseExpansion('keyboard', this.activeInteractable.id)
      return
    }

    if (this.activeInteractable.id === CROP_ZONE_INTERACTABLE_ID) {
      if (!this.isZoneUnlocked('crop_area')) {
        this.showInteractionFeedback(this.getLockedZonePrompt('crop_area'), FEEDBACK_COLOR_ERROR)
        return
      }

      const plantingTile = this.getPlantingTileInFront(ranchMapContract)
      if (!plantingTile) {
        return
      }

      this.tryCropActionAtTile(plantingTile.x, plantingTile.y, ranchMapContract, 'keyboard')
      return
    }

    if (this.activeInteractable.id === ANIMAL_PEN_INTERACTABLE_ID) {
      if (!this.isZoneUnlocked('animal_pen')) {
        this.showInteractionFeedback(this.getLockedZonePrompt('animal_pen'), FEEDBACK_COLOR_ERROR)
        return
      }

      const interactionTile = this.getPlantingTileInFront(ranchMapContract)
      if (!interactionTile) {
        return
      }

      this.tryAnimalActionAtTile(interactionTile.x, interactionTile.y, ranchMapContract, 'keyboard')
      return
    }

    if (this.isSellInteractableId(this.activeInteractable.id)) {
      const zoneId = this.getZoneIdForInteractable(this.activeInteractable.id)
      if (zoneId && !this.isZoneUnlocked(zoneId)) {
        this.showInteractionFeedback(this.getLockedZonePrompt(zoneId), FEEDBACK_COLOR_ERROR)
        return
      }

      this.trySellInventory(this.resolveSellPointId(this.activeInteractable.id), 'keyboard')
      return
    }

    if (this.isInteractableLockedByExpansion(this.activeInteractable.id)) {
      const zoneId = this.getZoneIdForInteractable(this.activeInteractable.id)
      if (zoneId) {
        this.showInteractionFeedback(this.getLockedZonePrompt(zoneId), FEEDBACK_COLOR_ERROR)
        return
      }
    }

    this.showInteractionFeedback(`Interacted with ${this.activeInteractable.label}`)
    const services = getGameServices(this)
    services.telemetry.track('ranch_interaction', {
      targetId: this.activeInteractable.id,
      targetLabel: this.activeInteractable.label,
      targetType: this.activeInteractable.type,
    })
  }

  private showInteractionFeedback(message: string, color: string = FEEDBACK_COLOR_DEFAULT): void {
    if (!this.interactionFeedback) {
      return
    }

    this.tweens.killTweensOf(this.interactionFeedback)
    this.interactionFeedback
      .setText(message)
      .setColor(color)
      .setVisible(true)
      .setAlpha(1)
      .setY(HUD_SAFE_TOP + 14)

    this.tweens.add({
      targets: this.interactionFeedback,
      y: HUD_SAFE_TOP + 2,
      alpha: 0,
      duration: 850,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.interactionFeedback?.setVisible(false)
      },
    })
  }

  private renderTerrainLayer(contract: RanchMapContract): void {
    const tileSize = contract.tileSize

    for (let y = 0; y < contract.height; y += 1) {
      for (let x = 0; x < contract.width; x += 1) {
        const frame =
          contract.baseFrameCycle[(x * 5 + y * 3) % contract.baseFrameCycle.length]
        const tile = this.add
          .image(x * tileSize, y * tileSize, 'tiny-ranch-tiles', frame)
          .setOrigin(0)
          .setDisplaySize(tileSize, tileSize)

        this.mapRoot?.add(tile)
      }
    }
  }

  private renderPatchLayer(
    contract: RanchMapContract,
    patches: TileRect[],
    frameCycle: number[],
  ): void {
    const tileSize = contract.tileSize

    patches.forEach((patch) => {
      for (let y = patch.y; y < patch.y + patch.height; y += 1) {
        for (let x = patch.x; x < patch.x + patch.width; x += 1) {
          const frame = frameCycle[(x * 11 + y * 7) % frameCycle.length]
          const tile = this.add
            .image(x * tileSize, y * tileSize, 'tiny-ranch-tiles', frame)
            .setOrigin(0)
            .setDisplaySize(tileSize, tileSize)

          this.mapRoot?.add(tile)
        }
      }
    })
  }

  private renderCropPlotLayer(contract: RanchMapContract): void {
    const tileSize = contract.tileSize

    contract.cropPlots.forEach((plot, index) => {
      const x = plot.x * tileSize + 1
      const y = plot.y * tileSize + 1
      const size = tileSize - 2
      const fillColor = index % 2 === 0 ? 0x2f6f45 : 0x275c3d
      const plotFrame = this.add
        .rectangle(x, y, size, size, fillColor, 0.18)
        .setOrigin(0)
        .setStrokeStyle(1, 0xe2c06a, 0.42)
        .setName(plot.id)

      this.mapRoot?.add(plotFrame)
    })
  }

  private renderSpriteLayer(contract: RanchMapContract): void {
    const tileSize = contract.tileSize

    const placements = [...contract.spritePlacements].sort((a, b) => {
      const layerDiff = layerOrder[a.layer] - layerOrder[b.layer]
      if (layerDiff !== 0) {
        return layerDiff
      }

      const yDiff = a.tileY - b.tileY
      if (yDiff !== 0) {
        return yDiff
      }

      return a.tileX - b.tileX
    })

    placements.forEach((placement) => {
      const sprite = this.add
        .image(
          placement.tileX * tileSize,
          placement.tileY * tileSize,
          placement.key,
          placement.frame,
        )
        .setOrigin(0)
        .setDisplaySize(tileSize, tileSize)

      this.mapRoot?.add(sprite)

      if (placement.layer === 'animal') {
        this.registerAnimalSlot(placement, sprite)
      }
    })
  }

  private registerAnimalSlot(
    placement: RanchSpritePlacement,
    sprite: Phaser.GameObjects.Image,
  ): void {
    const configId = animalSlotConfigByPlacementId[placement.id]
    if (!configId) {
      return
    }

    const slot: AnimalProductionSlot = {
      id: placement.id,
      tileX: placement.tileX,
      tileY: placement.tileY,
      configId,
      baseFrame: placement.frame,
      sprite,
      isActive: false,
      isFed: false,
      hasProductReady: false,
      cycleStartedAtEpochMs: null,
      nextProductAtEpochMs: null,
      nextProductTimeoutId: null,
    }

    slot.sprite.setFrame(slot.baseFrame)
    this.animalSlots.set(slot.id, slot)
    this.animalSlotsByTileKey.set(this.createTileKey(slot.tileX, slot.tileY), slot)
    this.updateAnimalSlotVisual(slot)
  }

  private renderZoneLayer(contract: RanchMapContract): void {
    const zonePalette: Record<string, number> = {
      farming: 0x8dd6a0,
      animals: 0xf6bf5f,
      navigation: 0x9cb8ff,
      economy: 0xff9f5f,
      utility: 0x74d5ff,
    }

    contract.zones.forEach((zone) => {
      const color = zonePalette[zone.purpose]
      const x = zone.x * contract.tileSize
      const y = zone.y * contract.tileSize
      const width = zone.width * contract.tileSize
      const height = zone.height * contract.tileSize

      const shape = this.add
        .rectangle(x, y, width, height, color, 0.16)
        .setOrigin(0)
        .setStrokeStyle(1, color, 0.6)
      const label = this.add
        .text(x + 4, y + 3, zone.label, {
          fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
          fontSize: '8px',
          color: '#f4efe3',
          backgroundColor: '#10241e',
        })
        .setPadding(2, 1, 2, 1)

      this.mapRoot?.add(shape)
      this.mapRoot?.add(label)
    })
  }
}
