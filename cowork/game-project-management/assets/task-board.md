# Task board

One row per task. **Each role updates only its own rows.** Register **role names only** — never session
ids. Creating a row does **not** authorize work to start.

| # | Task | Owner (role) | Execution | Acceptance | Next step | Evidence (artifact · commit) | Updated by · date |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | not started / in progress / blocked | not requested / self-reported / human-checked / failed | | | |
| 2 | | | | | | | |

## Cell conventions

- **Execution**: `not started` · `in progress` · `blocked on <role/task>` · `delivered`
- **Acceptance**: `not requested` · `self-reported complete (date · path · commit)` · `human-checked`
  (with date, checked scope/version) · `failed / rework`
- **Acceptance words** `passed / accepted / verified` may only be written by the role that owns that
  judgement (the spec owner, a designated review role, or the human) — never by the orchestrator.

## Self-reported line format

```
self-reported complete · 2026-10-15 · design/level-01.md · a1b2c3d
```

## Handling outstanding items

Anything carried over goes here or into the gap ledger; **never dropped without a record**:

| Gap | Owner | Needed by | Status |
| --- | --- | --- | --- |
| | | | |

## Recovery rule

First action on starting a turn: **read your own rows**. Last action before finishing: **update your own
rows**. After context compaction, the on-disk values win over session memory.
