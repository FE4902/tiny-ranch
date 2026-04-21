# Parent Coordination Lane Runbook

## Purpose

Define the canonical way to operate a long-lived parent coordination issue so child
execution stays continuous without parent status churn.

Primary reference lane: [VER-70](/VER/issues/VER-70).

## Canonical Defaults

- Parent coordination issue stays `blocked` by default.
- Parent `blockedByIssueIds` contains exactly one issue: the current active child lane.
- Parent is checked out only during a short resequencing/delegation window.
- After resequencing, parent is returned to `blocked` with the next child blocker set.
- Do not leave an assigned parent in `todo` or `in_progress` without an active run.

## Rotation Workflow

1. Wait for the current blocker child to reach `done`.
2. Checkout parent issue for a brief coordination window.
3. Promote or confirm the next child at the queue head (usually `todo`).
4. Patch parent back to canonical mode:
   - `status: blocked`
   - `blockedByIssueIds: ["<next-child-id>"]`
5. Post a rotation comment on the parent issue and exit.

Example patch payload for step 4:

```json
{
  "status": "blocked",
  "blockedByIssueIds": ["<next-child-id>"],
  "comment": "Rotated parent blocker to next active child and returned parent to canonical coordination mode."
}
```

## Copy-Ready Rotation Comment Template

Use this when rotating the parent blocker from completed child to next child:

```md
## Canonical Parent Rotation

Processed blocker-resolved wake and rotated parent coordination blocker to the next execution child.

- Completed blocker lane: [VER-OLD](/VER/issues/VER-OLD) is `done`.
- Next active queue head promoted: [VER-NEXT](/VER/issues/VER-NEXT) is now `todo`.
- Parent [VER-PARENT](/VER/issues/VER-PARENT) returned to canonical coordination mode as `blocked` with blocker set to [VER-NEXT](/VER/issues/VER-NEXT).
- Buffered runway remains: [VER-QUEUE-2](/VER/issues/VER-QUEUE-2) -> [VER-QUEUE-3](/VER/issues/VER-QUEUE-3).

Residual risk:
- Note any competing in-progress task or staffing conflict that could delay [VER-NEXT](/VER/issues/VER-NEXT) pickup.
```

## Validation Snapshot (VER-70)

- Before canonical handling (system auto-block loop visible):
  [VER-70 before](/VER/issues/VER-70#comment-6a5e6d0d-834a-485b-926a-8e46522cecc8)
- Canonical dependency-backed handling applied:
  [VER-70 canonical mode](/VER/issues/VER-70#comment-46a0d8b0-c5cb-45b0-9309-afcfb9c7a0af)
- Latest blocker rotation example:
  [VER-70 rotation](/VER/issues/VER-70#comment-d5172469-7212-41a2-9f16-f609024ee8d6)
