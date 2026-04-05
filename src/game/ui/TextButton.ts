import Phaser from 'phaser'

type ButtonPalette = {
  background: number
  backgroundActive: number
  border: number
  borderActive: number
  text: string
  textActive: string
}

const defaultPalette: ButtonPalette = {
  background: 0x123729,
  backgroundActive: 0xf6bf5f,
  border: 0x5e8d6a,
  borderActive: 0xffdfa5,
  text: '#f4efe3',
  textActive: '#0f231c',
}

export class TextButton extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Rectangle
  private readonly label: Phaser.GameObjects.Text

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    onClick: () => void,
    palette: ButtonPalette = defaultPalette,
  ) {
    super(scene, x, y)

    this.background = scene.add.rectangle(0, 0, 112, 40, palette.background, 0.98)
    this.background.setStrokeStyle(1, palette.border, 1)

    this.label = scene.add
      .text(0, 0, text, {
        fontFamily: '"Avenir Next", "Trebuchet MS", sans-serif',
        fontSize: '15px',
        fontStyle: '600',
        color: palette.text,
      })
      .setOrigin(0.5)

    this.add([this.background, this.label])
    this.setSize(this.background.width, this.background.height)
    this.setInteractive(
      new Phaser.Geom.Rectangle(
        -this.background.width / 2,
        -this.background.height / 2,
        this.background.width,
        this.background.height,
      ),
      Phaser.Geom.Rectangle.Contains,
    )

    this.on('pointerdown', onClick)
    this.on('pointerover', () => this.background.setAlpha(1))
    this.on('pointerout', () => this.background.setAlpha(0.98))

    this.setData('palette', palette)
  }

  setSelected(isSelected: boolean): void {
    const palette = this.getData('palette') as ButtonPalette

    this.background.setFillStyle(
      isSelected ? palette.backgroundActive : palette.background,
      0.98,
    )
    this.background.setStrokeStyle(1, isSelected ? palette.borderActive : palette.border, 1)
    this.label.setColor(isSelected ? palette.textActive : palette.text)
  }
}
