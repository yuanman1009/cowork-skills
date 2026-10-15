# Batches, ledgers and audit

## 1. Batch rhythm

| Rule | Meaning |
| --- | --- |
| One batch = one dispatch = one report | after the report, **stop and let the human look** |
| Report is three-part | **delivered / accepted / outstanding** |
| Outstanding items are never dropped without a record | next batch, or the gap ledger |
| One role through a full loop before scaling out | charter → work → artifact → notice → record |
| Synchronize on **closure** | triggers: a process established / a phase closed / one end-to-end job finished completely. Not triggers: every exchange, mid-flight assessment, anything not landed |
| Report landed facts + commit ids | not "what I am doing" — the ledger's accuracy is the orchestrator's value |
| Stop when the batch is done | do not widen scope on your own |

When the orchestrator is not running, send a **waking notice** (`--intent notice --wake wake`) and say so:
"no reply needed, no dispatch needed, purely informational". Waking is what gets it read in a turn; the
body tells the peer not to answer, so no reply round is spent.

## 2. Track separation

Different kinds of information belong in different artifacts. Mixing them is how one fact acquires two
standards.

| What | Where | Nature |
| --- | --- | --- |
| Specifications / rules / contracts | the rule source (single source) | current version only: replace in place, **no change notes** |
| Rulings / decisions | decision ledger | append-only |
| Reasoning | change record | "why it changed" |
| Gaps / to be filled | gap ledger | updated when settled |
| Task owner / progress / acceptance | task board | one row per task, each role edits only its own rows |
| Narration / retrospective | report directory | descriptive, **not authority** |
| History | version control | everything |

Indexes and derived artifacts are machine generated and regenerated when their source changes. When one
reports "stale", **re-run it once before judging** — it is usually a timing artifact of concurrent landing.

## 3. Board rules

- One row per task: owner · execution · acceptance · next step · evidence · updater · date.
- **Each role updates only its own rows.** No cross-editing.
- Creating a row **does not authorize work to start** (single task source).
- First action on starting: read your own rows. Last action on finishing: update your own rows.
- Register **role names only**, never session ids.

## 4. Ledger editing discipline

Long-row ledgers (rows of thousands of characters) are where parallel work breaks most often.

| # | Pitfall | Countermeasure |
| --- | --- | --- |
| 1 | An anchor taken from "the sentence at the end of that row" also occurs inside other rows ⇒ the insertion lands mid-row, truncating the old row and pushing the new one off-table | use a **unique, near-end** anchor and **verify with a tool that it occurs once**; or edit **by line index** (read → change by index → write back) |
| 2 | A bare section number read as a self-reference | cite with the artifact name, or write "section N" |
| 3 | Not running the gate after editing | always run the gate after a table edit; on "off-table / wrong column count" **roll back and redo** — never patch in place |
| 4 | Changing only "the most obvious place" | scope wording changes by **every artifact containing that wording**: reverse-scan → separate live rules from historical narration → edit live rules → leave narration → sweep each artifact fully → run the gate |
| 5 | Relaying a reading from elsewhere | go back to the source. Always source-read and write down the scope for: **quotes** (re-check the original) · **counts** (state *in which artifact* you counted) · **ownership** (check the whitelist, not "this looks like X's table") · **directories** (verify each name against disk) |
| 6 | Doing destructive operations directly | dry-run on the real file, assert match count and line numbers, then write |

## 5. Is the mechanism working?

- Pick any delivered artifact and you can immediately say: **who produced it, under which rule, where it is
  registered, and whether anyone checked it**.
- Ask any role "what may you do, what may you not touch" and the answer **matches the documents**.
- On a disagreement you can locate **who should change what without a meeting**.
- A new conversation can **start from the on-disk state** without interrogating the previous one.
- The batched report can be produced **from the ledger**, not from memory.

## 6. Audit of a single delivery

```bash
cross-chat read --to <role> --n 6          # what the peer actually received and answered
cross-chat list                            # does the target still exist, is it busy
cross-chat role list                       # are the role bindings current
```

Then check the local delivery ledger (`<stateDir>/deliveries.jsonl`): every line carries `receipt`,
`intent`, `wake`, `from`, `ticket`, `ok` and the delivered body. That is the "who reported what, when"
record — the board stores the work state; the ledger stores the traffic.
