# VER-118 Barn Mobile QA

## Manual QA Route

Use a mobile viewport and open the prototype with smoke mode enabled.

1. Navigate to the Barn scene.
2. On Cheese Press with no milk, tap `Start`; feedback should explain the missing milk.
3. Cycle to Feed Mix before tier 2; the recipe panel should show the configured unlock requirement and tapping `Start` should not queue a job.
4. With Cheese Press inputs available, tap `Start`; the queue should show the active timer.
5. After the job is ready, tap `Claim`; inventory should gain the configured output and the matching market order should read ready to ship.
6. Tap `Ship`; the order should consume the required goods, pay the configured payout, mark the order done, and persist after reload.

## Mobile Layout Guardrails

- Barn touch controls use a compact bottom row on narrow screens: recipe cycle, start, claim, and ship.
- The recipe panel carries the next actionable state so locked recipes, missing inputs, ready jobs, and claimable orders are visible without keyboard hints.
- Queue text is capped to the first four jobs and three orders; add pagination or scrolling before increasing those limits.
- Market-order payout and premium copy must continue to come from order config snapshots, not scene literals.
