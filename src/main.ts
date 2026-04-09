import './style.css'

type GlobalScopeWithNodeGlobal = typeof globalThis & {
  global?: typeof globalThis
}

const globalScope = globalThis as GlobalScopeWithNodeGlobal
if (typeof globalScope.global === 'undefined') {
  globalScope.global = globalThis
}

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Unable to find app root')
}

app.innerHTML = `
  <div class="shell">
    <section class="shell__hero">
      <p class="shell__eyebrow">Foundation Sprint</p>
      <h1>Tiny Ranch</h1>
      <p class="shell__lede">
        Phaser + Vite + TypeScript shell tuned for quick iteration, mobile-web safe
        defaults, and day-one telemetry hooks.
      </p>
      <div class="shell__chips" aria-label="Project goals">
        <span>Responsive canvas</span>
        <span>Scene switching</span>
        <span>Build-ready</span>
        <span>Instrumentation-ready</span>
      </div>
    </section>

    <div class="shell__body">
      <section class="shell__stage">
        <div class="stage-frame">
          <div id="game-root" class="game-root" aria-label="Tiny Ranch prototype"></div>
        </div>
      </section>

      <aside class="shell__sidebar">
        <div class="sidebar-card">
          <p class="sidebar-card__label">Source layout</p>
          <ul class="sidebar-card__list">
            <li><code>src/game/assets</code> tracks imported spritesheet metadata.</li>
            <li><code>src/game/scenes</code> handles flow and world views.</li>
            <li><code>src/game/ui</code> owns reusable HUD components.</li>
            <li><code>src/game/systems</code> keeps telemetry and runtime services isolated.</li>
            <li><code>src/assets/tiny-ranch</code> stores the imported art pack.</li>
          </ul>
        </div>

        <div class="sidebar-card">
          <p class="sidebar-card__label">Controls</p>
          <p class="sidebar-card__text">
            Use the in-game buttons or press <code>1</code> and <code>2</code> to swap
            between the ranch and barn shell scenes.
          </p>
        </div>
      </aside>
    </div>
  </div>
`

void bootstrap()

async function bootstrap(): Promise<void> {
  const { createGame } = await import('./game')

  createGame('game-root')
}
