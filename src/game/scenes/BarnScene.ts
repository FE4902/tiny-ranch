import Phaser from 'phaser'

import {
  barnProcessingRecipeIds,
  getBarnProcessingRecipeConfig,
  type BarnProcessingLineItem,
  type BarnProcessingRecipeId,
} from '../config/barn'
import { SCENE_KEYS } from '../constants'
import { getGameServices } from '../systems/runtime'
import { BasePlayScene } from './BasePlayScene'
import { TextButton } from '../ui/TextButton'

const PANEL_RIGHT_MARGIN = 24
const PANEL_TOP = 112
const READY_POLL_INTERVAL_MS = 1_000
const DEFAULT_BARN_RECIPE_ID: BarnProcessingRecipeId = barnProcessingRecipeIds[0] ?? 'cheese_press'

export interface BarnSceneDebugPoint {
  x: number
  y: number
}

export interface BarnSceneDebugUiSnapshot {
  selectedRecipeId: BarnProcessingRecipeId
  inventoryText: string
  recipeDetailText: string
  jobListText: string
  feedbackText: string
  cycleRecipeButtonCenter: BarnSceneDebugPoint | null
  startRecipeButtonCenter: BarnSceneDebugPoint | null
  claimButtonCenter: BarnSceneDebugPoint | null
}

export class BarnScene extends BasePlayScene {
  protected readonly title = 'Barn Processing'
  protected readonly subtitle = 'CONFIG-DRIVEN WORK QUEUE'
  protected readonly detail =
    'Queue ingredient batches, let them finish over time, and claim the outputs after reload without special migration steps.'
  protected readonly palette = {
    skyTop: 0x422918,
    skyBottom: 0x21120b,
    accent: 0xffd28b,
    terrain: 0x644131,
    terrainHighlight: 0x986b54,
  }
  private selectedRecipeId: BarnProcessingRecipeId = DEFAULT_BARN_RECIPE_ID
  private inventoryText?: Phaser.GameObjects.Text
  private recipeDetailText?: Phaser.GameObjects.Text
  private jobListText?: Phaser.GameObjects.Text
  private feedbackText?: Phaser.GameObjects.Text
  private cycleRecipeButton?: TextButton
  private startRecipeButton?: TextButton
  private claimButton?: TextButton
  private unsubscribeInventoryChanges?: () => void
  private unsubscribeBarnChanges?: () => void
  private refreshTimer?: Phaser.Time.TimerEvent

  private readonly resizeBarnUi = (): void => {
    this.layoutBarnUi()
    this.refreshBarnUi()
  }

  constructor() {
    super(SCENE_KEYS.barn)
  }

  create(): void {
    super.create()

    this.inventoryText = this.add.text(0, 0, '', {
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '16px',
      color: '#f4efe3',
      wordWrap: { width: 260 },
      lineSpacing: 6,
    })
    this.recipeDetailText = this.add.text(0, 0, '', {
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '16px',
      color: '#d8e5dc',
      wordWrap: { width: 260 },
      lineSpacing: 6,
    })
    this.jobListText = this.add.text(0, 0, '', {
      fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
      fontSize: '13px',
      color: '#f6bf5f',
      wordWrap: { width: 260 },
      lineSpacing: 5,
    })
    this.feedbackText = this.add.text(0, 0, '', {
      fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
      fontSize: '15px',
      color: '#8dd6a0',
      wordWrap: { width: 260 },
      lineSpacing: 4,
    })

    this.cycleRecipeButton = new TextButton(this, 0, 0, 'Next Recipe', () => {
      this.selectNextRecipe()
    })
    this.add.existing(this.cycleRecipeButton)

    this.startRecipeButton = new TextButton(this, 0, 0, 'Start Batch', () => {
      this.handleRecipeStart(this.selectedRecipeId)
    })
    this.add.existing(this.startRecipeButton)

    this.claimButton = new TextButton(this, 0, 0, 'Claim Ready', () => {
      this.handleClaimReadyJob()
    })
    this.add.existing(this.claimButton)

    const services = getGameServices(this)
    this.unsubscribeInventoryChanges = services.onInventoryChanged(() => this.refreshBarnUi())
    this.unsubscribeBarnChanges = services.onBarnStateChanged(() => this.refreshBarnUi())
    this.refreshTimer = this.time.addEvent({
      delay: READY_POLL_INTERVAL_MS,
      loop: true,
      callback: () => this.refreshBarnUi(),
    })

    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeBarnUi)
    const handleCycleRecipeHotkey = (): void => {
      this.selectNextRecipe()
    }
    const handleStartRecipeHotkey = (): void => {
      this.handleRecipeStart(this.selectedRecipeId, 'barn:keyboard')
    }
    const handleClaimReadyHotkey = (): void => {
      this.handleClaimReadyJob('barn:keyboard')
    }

    this.input.keyboard?.on('keydown-Q', handleCycleRecipeHotkey)
    this.input.keyboard?.on('keydown-W', handleStartRecipeHotkey)
    this.input.keyboard?.on('keydown-E', handleClaimReadyHotkey)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeBarnUi)
      this.input.keyboard?.off('keydown-Q', handleCycleRecipeHotkey)
      this.input.keyboard?.off('keydown-W', handleStartRecipeHotkey)
      this.input.keyboard?.off('keydown-E', handleClaimReadyHotkey)
      this.unsubscribeInventoryChanges?.()
      this.unsubscribeBarnChanges?.()
      this.refreshTimer?.destroy()
    })

    this.layoutBarnUi()
    this.refreshBarnUi()
  }

  private selectNextRecipe(): void {
    const currentIndex = barnProcessingRecipeIds.indexOf(this.selectedRecipeId)
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % barnProcessingRecipeIds.length : 0
    this.selectedRecipeId = barnProcessingRecipeIds[nextIndex] ?? DEFAULT_BARN_RECIPE_ID
    this.refreshBarnUi()
  }

  public getDebugUiSnapshot(): BarnSceneDebugUiSnapshot {
    return {
      selectedRecipeId: this.selectedRecipeId,
      inventoryText: this.inventoryText?.text ?? '',
      recipeDetailText: this.recipeDetailText?.text ?? '',
      jobListText: this.jobListText?.text ?? '',
      feedbackText: this.feedbackText?.text ?? '',
      cycleRecipeButtonCenter: this.resolveButtonCenter(this.cycleRecipeButton),
      startRecipeButtonCenter: this.resolveButtonCenter(this.startRecipeButton),
      claimButtonCenter: this.resolveButtonCenter(this.claimButton),
    }
  }

  private handleRecipeStart(
    recipeId: BarnProcessingRecipeId,
    source: string = 'barn:pointer',
  ): void {
    this.selectedRecipeId = recipeId
    const recipe = getBarnProcessingRecipeConfig(recipeId)
    const services = getGameServices(this)
    const result = services.startBarnJob(recipeId, source)

    if (!this.feedbackText) {
      return
    }

    if (result.result === 'started') {
      this.feedbackText.setColor('#8dd6a0')
      this.feedbackText.setText(`${recipe.label} started.`)
      this.refreshBarnUi()
      return
    }

    if (result.result === 'insufficient_funds') {
      const missingCoins = Math.max(0, recipe.fee - result.balance)
      this.feedbackText.setColor('#ff9f7a')
      this.feedbackText.setText(`Need ${missingCoins} more coin${missingCoins === 1 ? '' : 's'}.`)
      this.refreshBarnUi()
      return
    }

    const missingLine = result.missingInputs
      .map((item) => {
        const missingQuantity = Math.max(0, item.requiredQuantity - item.availableQuantity)
        return `${missingQuantity} ${this.formatItemLabel(item.itemId)}`
      })
      .join(', ')

    this.feedbackText.setColor('#ff9f7a')
    this.feedbackText.setText(`Missing ${missingLine}.`)
    this.refreshBarnUi()
  }

  private handleClaimReadyJob(source: string = 'barn:pointer'): void {
    const services = getGameServices(this)
    const nextReadyJob = services.getBarnStateSnapshot().jobs.find((job) => job.isReady) ?? null

    if (!this.feedbackText) {
      return
    }

    if (!nextReadyJob) {
      this.feedbackText.setColor('#f6bf5f')
      this.feedbackText.setText('No completed Barn jobs yet.')
      this.refreshBarnUi()
      return
    }

    const result = services.claimBarnJob(nextReadyJob.id, source)
    if (result.result !== 'claimed') {
      this.feedbackText.setColor('#ff9f7a')
      this.feedbackText.setText('Job is still processing.')
      this.refreshBarnUi()
      return
    }

    const recipe = getBarnProcessingRecipeConfig(result.recipeId ?? DEFAULT_BARN_RECIPE_ID)
    this.feedbackText.setColor('#8dd6a0')
    this.feedbackText.setText(`Claimed ${recipe.label.toLowerCase()} output.`)
    this.refreshBarnUi()
  }

  private refreshBarnUi(): void {
    if (
      !this.inventoryText ||
      !this.recipeDetailText ||
      !this.jobListText ||
      !this.feedbackText ||
      !this.cycleRecipeButton ||
      !this.startRecipeButton ||
      !this.claimButton
    ) {
      return
    }

    const services = getGameServices(this)
    const inventory = services.getInventorySnapshot()
    const barnState = services.getBarnStateSnapshot()
    const selectedRecipe = getBarnProcessingRecipeConfig(this.selectedRecipeId)
    const readyJobCount = barnState.jobs.filter((job) => job.isReady).length

    this.cycleRecipeButton.setSelected(false)
    this.startRecipeButton.setSelected(true)
    this.claimButton.setSelected(readyJobCount > 0)
    this.inventoryText.setText(
      [
        'Inventory',
        [
          this.formatInventoryLine('milk', inventory.milk ?? 0),
          this.formatInventoryLine('turnip', inventory.turnip ?? 0),
          this.formatInventoryLine('egg', inventory.egg ?? 0),
          this.formatInventoryLine('wool', inventory.wool ?? 0),
        ].join('  |  '),
        [
          this.formatInventoryLine('cheese', inventory.cheese ?? 0),
          this.formatInventoryLine('animal_feed', inventory.animal_feed ?? 0),
          this.formatInventoryLine('yarn', inventory.yarn ?? 0),
        ].join('  |  '),
        `Coins ${services.getCurrencyBalance()}`,
      ].join('\n'),
    )
    this.recipeDetailText.setText(
      [
        `${selectedRecipe.label} (${barnProcessingRecipeIds.indexOf(this.selectedRecipeId) + 1}/${barnProcessingRecipeIds.length})`,
        `Input ${this.formatLineItems(selectedRecipe.inputs)}`,
        `Output ${this.formatLineItems(selectedRecipe.outputs)}`,
        `Fee ${selectedRecipe.fee} coin${selectedRecipe.fee === 1 ? '' : 's'}`,
        `Duration ${this.formatDurationLabel(selectedRecipe.durationMs)}`,
        'Controls tap the buttons or press Q / W / E.',
        selectedRecipe.description,
      ].join('\n'),
    )
    this.jobListText.setText(this.buildJobListText(barnState.jobs))
  }

  private layoutBarnUi(): void {
    if (
      !this.inventoryText ||
      !this.recipeDetailText ||
      !this.jobListText ||
      !this.feedbackText ||
      !this.cycleRecipeButton ||
      !this.startRecipeButton ||
      !this.claimButton
    ) {
      return
    }

    const stackedLayout = this.scale.width < 760
    const panelX = stackedLayout ? 24 : Math.max(348, this.scale.width - 286)
    const contentWidth = stackedLayout
      ? Math.max(220, this.scale.width - 48)
      : Math.max(220, Math.min(260, this.scale.width - panelX - PANEL_RIGHT_MARGIN))
    const baseY = stackedLayout ? Math.max(286, this.scale.height * 0.5) : PANEL_TOP

    this.inventoryText.setPosition(panelX, baseY)
    this.recipeDetailText.setPosition(panelX, baseY + 88)
    this.jobListText.setPosition(panelX, baseY + 214)
    this.feedbackText.setPosition(panelX, stackedLayout ? baseY - 34 : this.scale.height - 108)

    this.inventoryText.setWordWrapWidth(contentWidth)
    this.recipeDetailText.setWordWrapWidth(contentWidth)
    this.jobListText.setWordWrapWidth(contentWidth)
    this.feedbackText.setWordWrapWidth(contentWidth)

    if (stackedLayout) {
      this.cycleRecipeButton.setPosition(panelX + 56, this.scale.height - 88)
      this.startRecipeButton.setPosition(panelX + 176, this.scale.height - 88)
      this.claimButton.setPosition(panelX + 56, this.scale.height - 40)
      return
    }

    this.cycleRecipeButton.setPosition(panelX + 56, baseY + 90)
    this.startRecipeButton.setPosition(panelX + 176, baseY + 90)
    this.claimButton.setPosition(panelX + 56, this.scale.height - 42)
  }

  private formatDurationLabel(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }

    return `${seconds}s`
  }

  private formatItemLabel(itemId: string): string {
    const cleaned = itemId.trim().replace(/[_-]+/g, ' ')
    if (cleaned.length === 0) {
      return 'item'
    }

    return cleaned
  }

  private formatInventoryLine(itemId: string, quantity: number): string {
    return `${this.formatItemLabel(itemId)} x${quantity}`
  }

  private formatLineItems(items: readonly BarnProcessingLineItem[]): string {
    return items
      .map((item) => `${this.formatItemLabel(item.itemId)} x${item.quantity}`)
      .join(', ')
  }

  private buildJobListText(
    jobs: readonly {
      label: string
      isReady: boolean
      remainingMs: number
      outputs: readonly BarnProcessingLineItem[]
    }[],
  ): string {
    if (jobs.length === 0) {
      return 'Queue\nNo Barn jobs queued.'
    }

    return [
      'Queue',
      ...jobs.slice(0, 6).map((job, index) => {
        const status = job.isReady ? 'ready' : this.formatDurationLabel(job.remainingMs)
        return `${index + 1}. ${job.label} -> ${this.formatLineItems(job.outputs)} (${status})`
      }),
    ].join('\n')
  }

  private resolveButtonCenter(button?: TextButton): BarnSceneDebugPoint | null {
    if (!button) {
      return null
    }

    return {
      x: button.x,
      y: button.y,
    }
  }
}
