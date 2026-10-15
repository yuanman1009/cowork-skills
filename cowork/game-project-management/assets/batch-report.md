# Batch report: <batch id / date>

One batch = one dispatch = one report. After this report: **stop and let the human look.**

## Delivered

| Task | Owner (role) | Deliverable (artifact path · commit) | Self-reported at |
| --- | --- | --- | --- |
| | | | |

## Accepted

| Task | Acceptance basis | By whom | Scope / version checked |
| --- | --- | --- | --- |
| | automated gate · downstream consumer · human check | | |

> Write `self-reported complete` unless the judgement is genuinely yours. Never write `passed / accepted /
> verified` on behalf of the human.

## Outstanding

| Item | Owner | Why it is outstanding | Next step | Needed by |
| --- | --- | --- | --- | --- |
| | | blocked on another role · waiting for a human decision · rework | | |

Outstanding items are **never dropped without a record**: they move to the next batch or into the gap ledger.

## Decisions needed from the human

Ask at most a few; each option carries its own meaning, plus a one-line recommendation. No codes, no file
paths, no internal jargon.

1. **Question** — options: A) <meaning + consequence> B) <meaning + consequence>
   Recommendation: <option>, because <one line>.
2. …

## Ledger deltas

| Kind | Where | Note |
| --- | --- | --- |
| specification update | rule source | replaced in place, no change notes |
| decision | decision ledger | append-only |
| reasoning | change record | |
| gap closed/opened | gap ledger | |
| traffic | `deliveries.jsonl` | receipts of this batch |
