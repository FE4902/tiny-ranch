/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TELEMETRY_SINK?: 'console' | 'posthog' | 'none'
  readonly VITE_POSTHOG_API_KEY?: string
  readonly VITE_POSTHOG_API_HOST?: string
  readonly VITE_POSTHOG_BATCH_SIZE?: string
  readonly VITE_POSTHOG_FLUSH_INTERVAL_MS?: string
  readonly VITE_POSTHOG_MAX_QUEUE_SIZE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
