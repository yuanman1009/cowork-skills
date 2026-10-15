# The delivery contract

Rules learned from real failures in parallel multi-session work. Each rule exists because its violation
was observed. Full rationale: `docs/DELIVERY-MECHANISM.md`.

## The model in one line

> **Messages get lost. Artifacts do not.**

So: anything that will be cited, recomputed or judged **lands as an artifact first**; the message carries
a one-line conclusion + the artifact path + what you want the peer to do. Anything that must survive
across sessions **lands on the board first**, never in session memory.

## The four primitives

| # | Primitive | Here |
| --- | --- | --- |
| **P1** | Session enumeration **with runtime state** | `cross-chat list` / `active` (running, idle) |
| **P2** | Directed delivery: target + body + **two structured markers** | `cross-chat send --to … --intent … --wake …` |
| **P3** | Delivery receipt = a unique message id | the `receipt` field of the result |
| **P4** | Artifact landing + machine-generated, staleness-checkable index | version control (+ the delivery ledger) |

## The two markers

`intent`: **notice** (tell only, default) | **work** (the peer must act).
`wake`: **wake** — deliver so the target runs a turn **now**, which is what makes a message actually get
read.

If something is merely informational, prefer landing the artifact and pointing at it in one message over
sending anything at all.

## The four hard requirements

1. **Never infer intent from prose.** "please handle this" is not a declaration — set `--intent work`
   or it will be read as a notice and disappear.
2. **Notices must not ask for a reply.** No "please confirm" appended to a body: it drags the target
   into a tool loop and doubles cost.
3. **Deliver behaviour, not promises.** Ask for the behaviour **in the turn the message creates**. A
   message that requests a *future* action ("when the human next writes, also output X") is not state:
   observed case — the peer read it, planned it explicitly, then its agent instance was **handed off**
   before the trigger arrived and the new instance ignored it, while the delivery receipt still said
   `ok: true`. Anything that must fire later belongs in a re-read-every-turn place (a file the role reads
   at entry, project memory, a board row) or must be driven by an event, not by the peer's memory.
4. **The delivery criterion is the return value**, not "go look in the peer's inbox". Reading the inbox
   cannot distinguish "not delivered" from "delivered but unread", and it invites resends.

Both misjudgements matter: success-read-as-failure (wrong criterion) and failure-read-as-success
(delivering into a target that no longer exists — enumerate first, P1).

## Delivery is completion

> Producer lands the artifact + delivers one notice = that batch is complete. **No side confirms.**

There is no receipt hop, no approval hop, no "accepted" hop. Requiring an acknowledgement turns the
workflow into "both sides stopped" — measured case: of five receipt deliveries, zero arrived because the
sender was waiting and the receiver considered delivery itself the end.

The orchestrator, on receiving a delivery: **read the artifact + record it**. No verdict.
Record: "X self-reports completion (date · artifact path · commit)".
Never use acceptance words (passed / accepted / verified) unless that judgement belongs to your role.

Delivery returned a failure ⇒ **fall back to the artifact**, record "notification failed + target +
reason" inside it. Never block the work, never pretend it was delivered.

## Addressing discipline

- Address by **role name**, never by session id.
- **Session ids never enter long-lived documents.** They expire and become ghost targets that still
  "deliver successfully" into a session nobody reads.
- **Ambiguity must fail loudly.** Two conversations resolving to one name would wake two writers at once
  and manufacture a concurrent-overwrite conflict. `cross-chat` errors instead of choosing.

## Concurrency

These four situations are normal states, not exceptions:

| Situation | Correct response |
| --- | --- |
| An edit was rejected (file changed underneath) | re-read → redo your change on the latest → write again (never force-overwrite) |
| A generated artifact reports "stale" | re-run it once first: it is usually a timing artifact of concurrent landing |
| Two tasks must touch one file | schedule the order explicitly; the later one continues **on top of** the in-flight change |
| Committing | **exact paths only** — never "commit everything" (it drags a peer's unfinished work in) |

Ownership is the lock against overwriting, not etiquette: an out-of-scope edit stages an overwrite
nobody notices. Raise a cross-role request instead.

## Turn discipline

- **Deliver, then stop.** No polling, no sleeping, no waiting for a reply.
- If something depends on a peer, register it as a blocker and keep working on what does not.
- On receiving a delivery: process + register. No receipt, no confirmation request, no verdict.
- A target that never answers: record "no artifact returned" and move on.
- Two attempts at one spot that do not converge ⇒ stop and change the approach; do not retry identically.
- `--wait` is the one bounded exception: it exists for genuinely interactive questions. Bound it with
  `--timeout`, and never wrap it in a loop.

## Degradation when a capability is missing

| Missing | Degraded approach | Cost |
| --- | --- | --- |
| No delivery return value | require at least a write-success id, otherwise treat as undelivered | cannot separate "not delivered" from "delivered but unread" |
| Cannot enumerate runtime state | skip the pre-check; on failure, record and leave the artifact on disk | may deliver into an ended target |
| No session-bound role names | keep a **config file** role → stable id, **not committed** | one extra external config |
