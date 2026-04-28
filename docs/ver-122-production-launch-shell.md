# VER-122 Production Launch Shell

## Scope

This pass keeps `pnpm run gate:mvp:release` as the top-level release-candidate gate from
[VER-121](/VER/issues/VER-121) and adds a small post-gate launch-shell validation layer for
production metadata and boot readiness.

## Launch Metadata

The production entry page now exposes:

- `Tiny Ranch - Cozy Browser Ranch Game` as the document, Open Graph, and Twitter title.
- Production-facing description copy for search and shared previews.
- `theme-color`, `application-name`, favicon, touch icon, manifest, and large share-card metadata.
- `public/site.webmanifest` with standalone display, app colors, and the Tiny Ranch SVG icon.

The visible browser shell is game-first and no longer describes the app as a prototype foundation
or engineering source layout.

## Validation Commands

Run the unified MVP release-candidate gate first:

```bash
pnpm run gate:mvp:release
```

Then run the launch-shell preview smoke:

```bash
pnpm run test:smoke:launch-shell
```

The launch-shell smoke uses the existing Playwright preview server configuration, so it builds the
production bundle, serves Vite preview at `http://127.0.0.1:4173`, checks desktop and mobile
viewports, verifies metadata/static assets/manifest fetches, and waits for the game to boot into the
Ranch scene with the smoke harness ready.

Targeted build-only validation remains:

```bash
pnpm run build
```

## Production Telemetry Config

Telemetry remains safe by default:

- No production env is required to build or boot the game.
- Default sink: `VITE_TELEMETRY_SINK=console`, which emits local `tiny-ranch:telemetry` window
  events and console lines.
- Disable delivery completely with `VITE_TELEMETRY_SINK=none`.
- Enable PostHog delivery with `VITE_TELEMETRY_SINK=posthog` and `VITE_POSTHOG_API_KEY`.

Optional PostHog tuning values:

- `VITE_POSTHOG_API_HOST` (default `https://us.i.posthog.com`)
- `VITE_POSTHOG_BATCH_SIZE` (default `20`)
- `VITE_POSTHOG_FLUSH_INTERVAL_MS` (default `5000`)
- `VITE_POSTHOG_MAX_QUEUE_SIZE` (default `200`)

If `VITE_TELEMETRY_SINK=posthog` is set without `VITE_POSTHOG_API_KEY`, runtime falls back to the
console sink and warns in the browser console.

## Telemetry Rollback

To roll back the configured production telemetry sink:

1. Set `VITE_TELEMETRY_SINK=none` to stop delivery, or `VITE_TELEMETRY_SINK=console` to keep local
   debug events only.
2. Remove `VITE_POSTHOG_API_KEY` and any optional PostHog overrides from deployment secrets.
3. Redeploy the same build target.
4. Re-run `pnpm run test:smoke:launch-shell` and verify the game boots.

For deeper analytics contract checks, keep using `docs/ver-42-startup-telemetry-baseline.md`.
