# Tiny Ranch

Tiny Ranch is a Phaser foundation for a mobile-first ranch simulation prototype on the open web.

## Stack

- Phaser 3 for rendering and scene management
- Vite for dev/build flow
- TypeScript for strict runtime contracts

## Getting Started

```bash
npm install
npm run dev
```

Build a production bundle with:

```bash
npm run build
```

## Project Structure

- `src/game/config` contains the Phaser runtime configuration
- `src/game/scenes` contains boot, preload, playable scenes, and the HUD scene
- `src/game/ui` contains reusable in-game UI components
- `src/game/systems` contains telemetry and performance helpers
- `src/assets` is ready for art/audio placeholders and future asset-pack imports

## Current Foundation

- Responsive Phaser bootstrap with mobile-web-friendly resize defaults
- Boot -> Preload -> Ranch flow with a persistent HUD scene
- Scene routing between Ranch and Barn shell scenes
- Lightweight console telemetry for boot, preload, scene changes, and first frame timing
