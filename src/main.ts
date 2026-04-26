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
  <div class="launch-shell">
    <header class="launch-shell__header">
      <div>
        <p class="launch-shell__eyebrow">Tiny Ranch</p>
        <h1>Grow a cozy ranch one harvest at a time.</h1>
      </div>
      <p class="launch-shell__lede">
        Plant crops, care for animals, craft barn goods, and ship village orders in a
        mobile-friendly browser ranch.
      </p>
    </header>

    <main class="launch-shell__stage" aria-label="Tiny Ranch playable game">
      <div id="game-root" class="game-root" aria-label="Tiny Ranch game"></div>
    </main>
  </div>
`

void bootstrap()

async function bootstrap(): Promise<void> {
  const { createGame } = await import('./game')

  createGame('game-root')
}
