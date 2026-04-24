import Phaser from 'phaser'

import { SCENE_KEYS, type PlayableSceneKey } from '../constants'
import {
  FIRST_SESSION_FUNNEL_DEBUG_EVENT,
  getFirstSessionFunnelDebugLog,
  type FirstSessionFunnelDebugEvent,
} from '../systems/firstSessionFunnel'
import {
  getGameServices,
  type ReturnSessionSummaryDismissSource,
} from '../systems/runtime'
import type { ReturnSessionSummary } from '../systems/offlineProgress'
import { TextButton } from '../ui/TextButton'

const DEBUG_SAVE_RESET_QUERY_PARAM = 'debugSaveReset'
const DEBUG_FUNNEL_OVERLAY_QUERY_PARAM = 'debugFunnel'
const MAX_FUNNEL_DEBUG_LINES = 7
const RETURN_SUMMARY_MODAL_MAX_WIDTH = 360
const RETURN_SUMMARY_MODAL_MIN_WIDTH = 260
const RETURN_SUMMARY_BACKDROP_DEPTH = 180
const RETURN_SUMMARY_MODAL_DEPTH = 181

interface ReturnSessionSummaryModal {
  summary: ReturnSessionSummary
  backdrop: Phaser.GameObjects.Rectangle
  card: Phaser.GameObjects.Container
  panel: Phaser.GameObjects.Rectangle
  title: Phaser.GameObjects.Text
  subtitle: Phaser.GameObjects.Text
  rewards: Phaser.GameObjects.Text
  skipLabel: Phaser.GameObjects.Text
  continueButton: TextButton
}

export interface UiSceneDebugReturnSessionSummaryModalSnapshot {
  isVisible: boolean
  titleText: string
  subtitleText: string
  rewardsText: string
}

function isDebugQueryFlagEnabled(queryParam: string): boolean {
  if (import.meta.env.DEV) {
    return true
  }

  if (typeof window === 'undefined') {
    return false
  }

  const debugFlag = new URLSearchParams(window.location.search).get(queryParam)
  return debugFlag === '1' || debugFlag === 'true'
}

function isDebugSaveResetEnabled(): boolean {
  return isDebugQueryFlagEnabled(DEBUG_SAVE_RESET_QUERY_PARAM)
}

function isDebugFunnelOverlayEnabled(): boolean {
  return isDebugQueryFlagEnabled(DEBUG_FUNNEL_OVERLAY_QUERY_PARAM)
}

function formatFunnelDebugLine(event: FirstSessionFunnelDebugEvent): string {
  const elapsedSeconds = (event.payload.elapsedSessionMs / 1000).toFixed(1)
  const location =
    event.payload.tileX === null || event.payload.tileY === null
      ? ''
      : ` @${event.payload.tileX},${event.payload.tileY}`
  const item = event.payload.itemId ? ` ${event.payload.itemId}` : ''
  const revenue = event.payload.revenue === null ? '' : ` +${event.payload.revenue}`
  return `${event.payload.eventIndex}. ${event.name} ${elapsedSeconds}s${item}${revenue}${location}`
}

export class UiScene extends Phaser.Scene {
  private activeSceneLabel?: Phaser.GameObjects.Text
  private buttons = new Map<PlayableSceneKey, TextButton>()
  private returnSessionSummaryModal?: ReturnSessionSummaryModal
  private returnSessionSummaryEscapeHandler?: (event: KeyboardEvent) => void

  constructor() {
    super(SCENE_KEYS.ui)
  }

  private formatRewardItemLabel(itemId: string): string {
    const cleaned = itemId.trim().replace(/[_-]+/g, ' ')
    if (cleaned.length === 0) {
      return 'item'
    }

    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }

  private formatDurationLabel(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }

    return `${seconds}s`
  }

  private buildReturnSummarySubtitle(summary: ReturnSessionSummary): string {
    const durationLabel = this.formatDurationLabel(summary.effectiveElapsedMs)
    const capsApplied = summary.wasOfflineTimeCapped || summary.wasRewardCapReached
    const capLine = capsApplied ? '\nCaps applied to keep catch-up deterministic.' : ''
    const autoCollectedLine =
      summary.totalItemsGranted > 0
        ? `Auto-collected ${summary.totalItemsGranted} item${summary.totalItemsGranted === 1 ? '' : 's'}.`
        : ''
    const estimatedValueLine =
      summary.totalItemsGranted > 0
        ? `Estimated sell value: ${summary.totalEstimatedSellValue} coins.`
        : ''
    const barnReadyLine =
      summary.barnJobsReady > 0
        ? `Barn finished ${summary.barnJobsReady} job${summary.barnJobsReady === 1 ? '' : 's'} while you were away. Claim ${summary.barnJobsReady === 1 ? 'it' : 'them'} in the Barn.`
        : ''

    return [
      `Away for ${durationLabel}.`,
      autoCollectedLine,
      estimatedValueLine,
      barnReadyLine,
      capLine,
    ]
      .filter((line) => line.length > 0)
      .join('\n')
  }

  private buildReturnSummaryRewards(summary: ReturnSessionSummary): string {
    const lines: string[] = []
    const visibleRewards = summary.rewards.slice(0, 6)
    lines.push(...visibleRewards.map((reward) => {
      const itemLabel = this.formatRewardItemLabel(reward.itemId)
      return `+${reward.quantity} ${itemLabel}`
    }))

    if (summary.rewards.length > visibleRewards.length) {
      lines.push(`+${summary.rewards.length - visibleRewards.length} more reward types`)
    }

    const visibleBarnReadyRecipes = summary.barnReadyRecipes.slice(0, 4)
    lines.push(
      ...visibleBarnReadyRecipes.map((recipe) =>
        recipe.quantity > 1 ? `Barn: ${recipe.label} x${recipe.quantity}` : `Barn: ${recipe.label}`,
      ),
    )

    if (summary.barnReadyRecipes.length > visibleBarnReadyRecipes.length) {
      lines.push(`Barn: +${summary.barnReadyRecipes.length - visibleBarnReadyRecipes.length} more recipe types ready`)
    }

    return lines.join('\n')
  }

  getDebugReturnSessionSummaryModalSnapshot(): UiSceneDebugReturnSessionSummaryModalSnapshot {
    const modal = this.returnSessionSummaryModal
    if (!modal) {
      return {
        isVisible: false,
        titleText: '',
        subtitleText: '',
        rewardsText: '',
      }
    }

    return {
      isVisible: true,
      titleText: modal.title.text,
      subtitleText: modal.subtitle.text,
      rewardsText: modal.rewards.text,
    }
  }

  private layoutReturnSessionSummaryModal(): void {
    const modal = this.returnSessionSummaryModal
    if (!modal) {
      return
    }

    const modalWidth = Math.max(
      RETURN_SUMMARY_MODAL_MIN_WIDTH,
      Math.min(RETURN_SUMMARY_MODAL_MAX_WIDTH, this.scale.width - 24),
    )
    const wrapWidth = modalWidth - 40
    modal.subtitle.setWordWrapWidth(wrapWidth, true)
    modal.rewards.setWordWrapWidth(wrapWidth, true)

    const panelHeight = Math.max(
      212,
      modal.title.height + modal.subtitle.height + modal.rewards.height + 112,
    )

    modal.backdrop.setSize(this.scale.width, this.scale.height)
    modal.card.setPosition(this.scale.width * 0.5, this.scale.height * 0.5)
    modal.panel.setSize(modalWidth, panelHeight)
    modal.title.setPosition(0, -panelHeight * 0.5 + 18)
    modal.skipLabel.setPosition(modalWidth * 0.5 - 16, -panelHeight * 0.5 + 18)
    modal.subtitle.setPosition(0, modal.title.y + modal.title.height + 8)
    modal.rewards.setPosition(0, modal.subtitle.y + modal.subtitle.height + 12)
    modal.continueButton.setPosition(0, panelHeight * 0.5 - 30)
  }

  private dismissReturnSessionSummaryModal(
    source: ReturnSessionSummaryDismissSource,
    trackClaim: boolean = true,
  ): void {
    const modal = this.returnSessionSummaryModal
    if (!modal) {
      return
    }

    modal.backdrop.off(Phaser.Input.Events.POINTER_DOWN)
    modal.skipLabel.off(Phaser.Input.Events.POINTER_DOWN)
    modal.continueButton.off(Phaser.Input.Events.POINTER_DOWN)
    modal.card.destroy(true)
    modal.backdrop.destroy()
    this.returnSessionSummaryModal = undefined

    if (typeof window !== 'undefined' && this.returnSessionSummaryEscapeHandler) {
      window.removeEventListener('keydown', this.returnSessionSummaryEscapeHandler)
      this.returnSessionSummaryEscapeHandler = undefined
    }

    if (!trackClaim) {
      return
    }

    const services = getGameServices(this)
    services.dismissReturnSessionSummary(source)
  }

  private showReturnSessionSummaryModal(): void {
    const services = getGameServices(this)
    const summary = services.getPendingReturnSessionSummary()
    if (!summary || this.returnSessionSummaryModal) {
      return
    }

    const backdrop = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x030c09, 0.74)
      .setOrigin(0)
      .setDepth(RETURN_SUMMARY_BACKDROP_DEPTH)
      .setInteractive({ useHandCursor: true })
    backdrop.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.dismissReturnSessionSummaryModal('backdrop_tap')
    })

    const panel = this.add
      .rectangle(0, 0, RETURN_SUMMARY_MODAL_MIN_WIDTH, 220, 0x10241e, 0.96)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0xf6bf5f, 0.55)
    const title = this.add
      .text(0, 0, 'Welcome Back', {
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '20px',
        color: '#f6bf5f',
      })
      .setOrigin(0.5, 0)
    const subtitle = this.add
      .text(0, 0, this.buildReturnSummarySubtitle(summary), {
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '13px',
        color: '#f4efe3',
        align: 'center',
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0)
    const rewards = this.add
      .text(0, 0, this.buildReturnSummaryRewards(summary), {
        fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
        fontSize: '12px',
        color: '#dff9d7',
        align: 'center',
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0)
    const skipLabel = this.add
      .text(0, 0, 'Skip', {
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '12px',
        color: '#f4efe3',
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true })
    skipLabel.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.dismissReturnSessionSummaryModal('close_button')
    })

    const continueButton = new TextButton(this, 0, 0, 'Continue', () => {
      this.dismissReturnSessionSummaryModal('continue_button')
    })
    this.add.existing(continueButton)

    const card = this.add.container(this.scale.width * 0.5, this.scale.height * 0.5)
    card.setDepth(RETURN_SUMMARY_MODAL_DEPTH)
    card.add([panel, title, subtitle, rewards, skipLabel, continueButton])

    this.returnSessionSummaryModal = {
      summary,
      backdrop,
      card,
      panel,
      title,
      subtitle,
      rewards,
      skipLabel,
      continueButton,
    }
    this.layoutReturnSessionSummaryModal()

    if (typeof window !== 'undefined') {
      this.returnSessionSummaryEscapeHandler = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape') {
          return
        }

        event.preventDefault()
        this.dismissReturnSessionSummaryModal('keyboard_escape')
      }
      window.addEventListener('keydown', this.returnSessionSummaryEscapeHandler)
    }
  }

  create(): void {
    const services = getGameServices(this)
    const debugSaveResetEnabled = isDebugSaveResetEnabled()
    const debugFunnelOverlayEnabled = isDebugFunnelOverlayEnabled()
    const funnelDebugLines: string[] = []

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

    const triggerDebugSaveReset = (): void => {
      services.resetSavedGameState()
      window.location.reload()
    }

    const debugResetHint = debugSaveResetEnabled
      ? this.add
          .text(0, 0, 'Debug: click here or Shift+R to reset save', {
            fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
            fontSize: '10px',
            color: '#f6bf5f',
          })
          .setOrigin(0, 0.5)
          .setInteractive({ useHandCursor: true })
      : undefined
    debugResetHint?.on('pointerdown', () => {
      triggerDebugSaveReset()
    })

    const funnelDebugOverlay = debugFunnelOverlayEnabled
      ? this.add
          .text(0, 0, '', {
            fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
            fontSize: '10px',
            color: '#d7f4e4',
            backgroundColor: '#10241ecc',
            lineSpacing: 2,
          })
          .setPadding(8, 6, 8, 6)
          .setOrigin(0, 0)
          .setDepth(160)
      : undefined

    this.add.existing(ranchButton)
    this.add.existing(barnButton)

    const renderFunnelDebugOverlay = (): void => {
      if (!funnelDebugOverlay) {
        return
      }

      const lines =
        funnelDebugLines.length > 0
          ? funnelDebugLines.join('\n')
          : 'Awaiting first-session funnel events...'
      funnelDebugOverlay.setText(`Funnel Event Order\n${lines}`)
    }

    const pushFunnelDebugLine = (event: FirstSessionFunnelDebugEvent): void => {
      funnelDebugLines.push(formatFunnelDebugLine(event))
      if (funnelDebugLines.length > MAX_FUNNEL_DEBUG_LINES) {
        funnelDebugLines.splice(0, funnelDebugLines.length - MAX_FUNNEL_DEBUG_LINES)
      }

      renderFunnelDebugOverlay()
    }

    const handleFunnelDebugEvent = (event: Event): void => {
      const detail = (event as CustomEvent<FirstSessionFunnelDebugEvent>).detail
      if (!detail) {
        return
      }

      pushFunnelDebugLine(detail)
    }

    if (debugFunnelOverlayEnabled) {
      const historicalEvents = getFirstSessionFunnelDebugLog()
      historicalEvents.forEach((event) => {
        pushFunnelDebugLine(event)
      })

      if (historicalEvents.length === 0) {
        renderFunnelDebugOverlay()
      }

      if (typeof window !== 'undefined') {
        window.addEventListener(FIRST_SESSION_FUNNEL_DEBUG_EVENT, handleFunnelDebugEvent as EventListener)
      }
    }

    const layout = (): void => {
      const { width } = this.scale
      toolbar.setSize(width, 66)
      this.activeSceneLabel?.setPosition(width - 18, 32)
      debugResetHint?.setPosition(16, 54)
      funnelDebugOverlay?.setPosition(16, 72)
      this.layoutReturnSessionSummaryModal()
    }

    const setSelectedScene = (sceneKey: PlayableSceneKey): void => {
      this.activeSceneLabel?.setText(`Now viewing: ${sceneKey}`)
      for (const [key, button] of this.buttons) {
        button.setSelected(key === sceneKey)
      }
    }

    layout()
    setSelectedScene(services.getActiveScene() ?? SCENE_KEYS.ranch)
    this.showReturnSessionSummaryModal()

    this.scale.on(Phaser.Scale.Events.RESIZE, layout)
    this.game.events.on('tiny-ranch:scene-changed', setSelectedScene)

    const handleRanchHotkey = (): void => services.navigate(SCENE_KEYS.ranch)
    const handleBarnHotkey = (): void => services.navigate(SCENE_KEYS.barn)
    const handleDebugResetHotkey = (event: KeyboardEvent): void => {
      if (!debugSaveResetEnabled || !event.shiftKey) {
        return
      }

      event.preventDefault()
      triggerDebugSaveReset()
    }

    this.input.keyboard?.on('keydown-ONE', handleRanchHotkey)
    this.input.keyboard?.on('keydown-TWO', handleBarnHotkey)
    if (debugSaveResetEnabled) {
      this.input.keyboard?.on('keydown-R', handleDebugResetHotkey)
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, layout)
      this.game.events.off('tiny-ranch:scene-changed', setSelectedScene)
      this.input.keyboard?.off('keydown-ONE', handleRanchHotkey)
      this.input.keyboard?.off('keydown-TWO', handleBarnHotkey)
      if (debugSaveResetEnabled) {
        this.input.keyboard?.off('keydown-R', handleDebugResetHotkey)
      }
      debugResetHint?.off('pointerdown')
      if (debugFunnelOverlayEnabled && typeof window !== 'undefined') {
        window.removeEventListener(
          FIRST_SESSION_FUNNEL_DEBUG_EVENT,
          handleFunnelDebugEvent as EventListener,
        )
      }
      this.dismissReturnSessionSummaryModal('unknown', false)
    })
  }
}
