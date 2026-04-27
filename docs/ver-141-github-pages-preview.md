# VER-141 GitHub Pages Preview

## Deployment

- Host: GitHub Pages for `FE4902/tiny-ranch`
- Preview URL: `https://fe4902.github.io/tiny-ranch/`
- Workflow: `.github/workflows/pages-preview.yml`
- Artifact: static Vite `dist/`
- Build env: `VITE_BASE_PATH=/tiny-ranch/`, `VITE_EXPERIMENT_PHASER_BUILD=package`, `VITE_TELEMETRY_SINK=console`
- PostHog envs: unset

## Smoke

Use the deployed launch-shell smoke without a local web server:

```bash
PLAYWRIGHT_BASE_URL=https://fe4902.github.io/tiny-ranch/ pnpm exec playwright test tests/smoke/launch-shell.spec.ts --project=desktop-chromium --project=mobile-chromium
```

## Rollback

- Disable or revert `.github/workflows/pages-preview.yml`, or redeploy the previous validated Pages artifact.
- Telemetry rollback is `VITE_TELEMETRY_SINK=none` or `VITE_TELEMETRY_SINK=console` with no `VITE_POSTHOG_*` envs.

## Post-Share Checks

- First session: game boots, canvas is visible, and launch metadata/static assets resolve from `/tiny-ranch/`.
- Core loop: plant, harvest, sell, expansion, save/load, and Barn handoff still work after deployment.
- Retention: monitor first-session funnel, return objective, retention gate snapshots, and Barn queue/market-order telemetry in console mode during controlled sharing.
