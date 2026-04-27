import { defineConfig } from 'vite'

const phaserBuild = (process.env.VITE_EXPERIMENT_PHASER_BUILD ?? 'core').trim().toLowerCase()
const useManualChunks = process.env.VITE_EXPERIMENT_MANUAL_CHUNKS === '1'

const resolveBasePath = (): string => {
  const basePath = process.env.VITE_BASE_PATH?.trim()
  if (!basePath || basePath === '/') {
    return '/'
  }

  if (/^[a-z]+:\/\//i.test(basePath)) {
    return basePath.endsWith('/') ? basePath : `${basePath}/`
  }

  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

const resolvePhaserAlias = (): string | null => {
  switch (phaserBuild) {
    case 'core':
      return 'phaser/src/phaser-core.js'
    case 'arcade':
      return 'phaser/src/phaser-arcade-physics.js'
    case 'package':
    case 'full':
    case 'default':
      return null
    default:
      throw new Error(
        `Unsupported VITE_EXPERIMENT_PHASER_BUILD value "${phaserBuild}". Use one of: core, arcade, package.`,
      )
  }
}

const phaserAlias = resolvePhaserAlias()
const alias = phaserAlias
  ? [
      { find: /^phaser$/, replacement: phaserAlias },
      { find: /^phaser3spectorjs$/, replacement: '/src/game/shims/phaser3spectorjs.ts' },
    ]
  : []

export default defineConfig({
  base: resolveBasePath(),
  resolve: {
    alias,
  },
  build: {
    rollupOptions: useManualChunks
      ? {
          output: {
            manualChunks(id) {
              if (id.includes('/node_modules/phaser/')) {
                return 'vendor-phaser'
              }
            },
          },
        }
      : undefined,
  },
})
