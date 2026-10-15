# Delivery mechanism — how work travels between sessions

> **Scope**: several independent agent sessions working in parallel on the same file system and
> repository, needing to hand work to each other without stepping on each other.
> **This document carries the mechanism and the interface contract only** — no project specifics, no
> machine paths, no platform framework names. Implementations map the semantics onto their own tools.
> **Companion document**: roles, ownership, escalation gates and acceptance live in
> [ROLE-BOUNDARIES.md](ROLE-BOUNDARIES.md); this one is only about *how work travels*.

Every rule below exists because the corresponding failure was observed in production, not imagined.
The tables start with the failure and end with the rule that closes it.

---

## 1. Failure → mechanism

| Failure / anti-pattern | Consequence | Mechanism |
| --- | --- | --- |
| Putting the "conclusion + reading + criteria" *in the message* | the receiver only ever sees a summary, **the source is unreproducible** and gets requested again | artifact/message separation (§3) |
| Sender thinks "I told them", receiver thinks "I'm waiting for confirmation" | **both sides stop** | delivery is completion (§4) |
| Requiring the peer to answer "acknowledged" | same; and if that sentence is **auto-appended to every message**, the third hop you just removed comes back | delivery is completion (§4) |
| Expressing intent through prose ("please handle this") | **work is read as a notice and disappears without a trace**; afterwards nobody can tell whether it was unset or unread | structured intent (§5) |
| Asking for a reply on a notice | the target enters a tool loop, **cost multiplies** | §5 requirement 2 |
| Notices that wake the target (routine status reports especially) | budget is spent without anyone noticing | §5 requirement 3 |
| Using "a new line appeared in the peer's inbox" as the delivery criterion | a queued delivery produces **no new line** ⇒ **success is read as failure** ⇒ resend, duplicated work | §5 requirement 4 |
| Writing session ids into ledgers / documents / skills | after the id expires it becomes a **ghost target**: delivery "looks successful" while nobody receives it | addressing discipline (§5.4) |
| Picking one of two same-named roles at random | **two writers are woken at once**, manufacturing a concurrent-overwrite conflict | addressing discipline (§5.4) |
| Two sessions editing one file, one overwriting the other | results are **lost without a trace** and hard to attribute | concurrency & ownership (§6) |
| "Commit everything" | someone else's unfinished work lands in the repository | concurrency & ownership (§6) |
| Progress only in session memory / chat history | after compaction or a restart **nobody can say who is doing what** | on-disk board (§7) |
| The orchestrator invents tasks and picks a direction | **the whole batch is voided** | single task source (§8) |
| N sub-agents each judging "acceptable" | one fact yields N standards, surfacing **much later and unattributably** | fan-out (§9) |
| Polling / waiting / sleeping for a reply after delivering | **both sides stop** (and the peer never needed to reply) | turn discipline (§10) |
| Retrying the same spot after two non-converging attempts | churn | turn discipline (§10) |

---

## 2. Core model

| Concept | Definition | Key property |
| --- | --- | --- |
| **Session** | one independent context with its own model, budget, tool permissions and working directory | it ends, gets compacted, restarts ⇒ **never a place to store facts** |
| **Role name** | a logical address meaning "whichever session currently holds this responsibility" | **stable**; session ids are not |
| **Artifact** | a file on disk, under version control | **the authoritative carrier**: on disk, reproducible, traceable |
| **Message** | point-to-point instant text delivery | **a notification**: can be lost, truncated, unqueryable afterwards |
| **Board** | a persisted task-state table (on disk) | **the single source of truth for progress** across sessions |

One invariant is the origin of every rule in this document:

> **Messages get lost. Artifacts do not.**

- Corollary 1: anything that will be cited, recomputed or judged **lands as an artifact first**;
  the message carries *path + one-line conclusion* only.
- Corollary 2: anything that must survive across sessions **lands on the board first** — never in
  session memory.

---

## 3. Artifact / message separation

### 3.1 Hard rule

Anything combining **conclusion · readings · criteria** (measurements, acceptance results, root-cause
analysis, spec interpretation) **lands as an artifact first**.

A message body may contain three things: **a one-line conclusion + the artifact path + what you want
the peer to do**. A message is never the carrier.

*Observed failure*: a role's full measurement and acceptance texts were summarized into messages; the
receiver **read only summaries twice** and the full text never arrived.

### 3.2 Two tracks, two readers (write both)

| Track | Reader | Shape |
| --- | --- | --- |
| **Summary** | a human | three parts: what happened / what was found / whether you must decide. **No ids, no file names, no internal jargon** |
| **Artifact** | a peer role | readings, criteria, minimal reproduction, covered and uncovered scope |

*Only artifacts ⇒ humans cannot read it. Only summaries ⇒ peers cannot reproduce it.*

### 3.3 Artifacts are records, not authority

An artifact is descriptive and **is not a basis for decisions**. To "cite an artifact as authority"
you must trace back to the **rule source** (specification, contract, formally registered conclusion).

Conversely: **never use "an artifact says so" as evidence that a rule holds.** Artifacts record;
rules have their own single definition.

---

## 4. Delivery is completion

### 4.1 Wording

> **Producer lands the artifact + delivers one notice to the orchestrator = that batch is complete.**

**No side confirms anything.** There is no receipt hop, no approval hop, no "accepted" hop.

*Observed failure*: an early version required "deliver → receipt → confirm". Of the first five receipt
deliveries, **zero arrived** (the sender was waiting for confirmation; the receiver considered delivery
itself the end). Worse, the sentence "please reply to confirm" got **auto-appended to every message**,
reinstalling the third hop that had already been removed — and contradicting the "do not reply" line in
the same body.

> **Delivery itself is the receipt.** Never turn "confirmation" into a process hop: it bleeds out as
> "both sides stopped".

### 4.2 What the orchestrator does

On receiving a delivery: **read the artifact + record it.** No receipt, no confirmation request, no
verdict on whether the peer passed.

Record semantics = **"X self-reports completion (date · artifact path · commit)"**.

**Forbidden acceptance words**: passed / accepted / verified — unless that judgement was actually made
by the role or the human that owns it.

### 4.3 When delivery fails

If delivery returns a failure ⇒ **fall back to the artifact**, and record "notification failed +
target + reason" inside it.

**Never block the work because a message failed, and never quietly treat it as delivered.**

### 4.4 Doubts and corrections

- Artifact disagrees with the current rule ⇒ **record as-is + note the doubt + report to the human**
  (do not block, do not bounce, do not edit on their behalf).
- You spot your own mistake after delivering ⇒ **deliver a correction** ("previous message void /
  corrected to X") so the peer keeps an accurate trail.

**Do not** quietly edit the artifact and pretend nothing happened — a trail is worth more than face.

---

## 5. Primitive contract

The minimum interface an implementation must provide. **Names follow your framework; the semantics
must all be present.**

### 5.1 The four primitives

| # | Primitive | Semantics | Must guarantee |
| --- | --- | --- | --- |
| **P1** | **Session enumeration** | list current deliverable targets | each target's **runtime state** (running / idle / ended) so the sender can judge whether delivery is worth it |
| **P2** | **Directed delivery** | target (role name) + body + **two markers** (§5.2) | **structured parameters**; never inferred from prose |
| **P3** | **Delivery receipt** | return a **unique message id** | that id is the **proof of delivery** |
| **P4** | **Artifact landing + index** | write artifacts where other sessions can read them | usually version control; if an index of "which artifacts exist" is needed it must be **machine generated** and **staleness-checkable** |

### 5.2 The two markers (the easiest thing to get wrong)

**Marker 1 — INTENT**: does this message require the peer to act?

| Value | Semantics |
| --- | --- |
| `notice` | tell only. **Must not ask for a reply.** ✅ **the default** |
| `work` | the peer must actually act (explicit) |

**Marker 2 — WAKE**: does delivery **immediately start a turn** in the target?

| Value | Semantics | Cost |
| --- | --- | --- |
| `queue` | queued inbox, starts nothing | near zero; read when the target next runs |
| `wake` | start one full turn now | **one full turn of the target's budget** |

> The default combination must be **notice + queue** — **fail-safe**: a forgotten parameter costs
> "the message waits a bit", never "a turn of budget vanished".

### 5.3 Four hard requirements

| # | Requirement | Failure mode it prevents |
| --- | --- | --- |
| **1** | **Intent is never inferred from prose.** "please handle this" is not a declaration; a structured parameter must carry it | work read as notice and lost without a trace; no way to tell "unset" from "unread" afterwards |
| **2** | **Notices must not ask for a reply.** Never auto-append "please confirm" to a body | the target enters a tool loop, cost multiplies, and it contradicts a "do not reply" body |
| **3** | **Waking must be explicit.** Notices never wake — routine status reports above all | daily reports wake every target and eat budget with nobody noticing |
| **4** | **The delivery criterion is the return value**, not "go look in the peer's inbox". Never treat "a new line appeared in the target's stream" as the criterion | with a queued delivery nothing enters the target's stream ⇒ the criterion **reads success as failure** ⇒ resends, duplicated work |

Both directions of misjudgement must be prevented:
① **success read as failure** — the criterion looked in the wrong place (requirement 4);
② **failure read as success** — delivering into a target that no longer exists, which *looks*
successful while nobody receives it. **Prevention** = enumerate sessions and check runtime state
before delivering (P1); an ended target means the delivery is thrown away.

### 5.4 Addressing discipline

- **Address by role name, never by session id.**
- **Session ids never enter long-lived documents** (config, ledger, skills, task board).
  *Failure mode*: ids expire, so a long-lived document turns into a **ghost target**; delivering there
  reaches a session nobody reads **and still looks successful**.
- **Role-name ambiguity must fail loudly, never pick one at random.**
  *Failure mode*: two sessions with the same role name in one workspace ⇒ addressing by name **wakes
  two writers at once**, manufacturing a concurrent-write conflict.
  If the framework allows several sessions to resolve to one name ⇒ **require explicit failure on
  ambiguity** and allow a stable identifier as the fallback.

---

## 6. Concurrency & ownership

With several writers sharing a file system and a repository, these four situations are **normal
states, not exceptions**.

| Situation | Correct response | Wrong response |
| --- | --- | --- |
| Edit rejected (the file changed underneath) | **re-read → redo your change on top of the latest → write again** | force-overwrite to "clear the way" |
| A machine-generated product reports "stale" (index, summary table) | **re-run it once before judging** — it is usually a timing artifact of concurrent landing | file it as a defect and "fix" it as one |
| Two tasks must change the same file | **order them explicitly** (serialize), or have one continue **on top of the other's in-flight change** | each edits from an old version and reverts the other |
| Committing | **exact paths** — only this batch's artifacts | "commit everything" — drags someone's unfinished work into the repository |

**Merge discipline for shared resources**: when two tasks necessarily touch one file, **the order must
be scheduled explicitly**, and the task description must state "continue on top of the other side's
current change; do not revert it".

**Ownership** (who creates, who owns, who is read-only) is defined in the companion document §3. In a
concurrency context it means one thing:

> Ownership is not etiquette, it is **the lock against overwriting**. Editing out of scope = staging
> one overwrite nobody notices.

---

## 7. On-disk board

### 7.1 Why it must be on disk

Session memory **cannot store progress**: contexts get compacted, sessions restart, orchestrators are
replaced.

**Rule**: a task's owner, execution state, acceptance state, next step and evidence **all land on
disk**; when recovering context, **the on-disk value wins over session memory**.

### 7.2 How to write it

| Item | Rule |
| --- | --- |
| Granularity | one row per task: owner, execution, acceptance, next step, evidence, updater, date |
| Update right | **each role updates only the rows it owns** (narrow aperture) — never someone else's rows |
| Row creation | coordinated by the orchestrator; **creating a row does not authorize work to start** (§8) |
| Recovery | first action on starting = read your own rows; last action on finishing = update your own rows |
| Aliases | register **role names only**, never session ids |

### 7.3 The orchestrator's progress record

The orchestrator only **records faithfully** — it does not audit: no pass/fail, no gate, no bounce, no
acceptance artifact.

**Key**: every record must trace back to **whose delivery, which one**. "X self-reports completion
(date · artifact path · commit)" is worth far more than "done" — the latter cannot be audited.

---

## 8. Single task source

> **This is the highest-priority clause. Violating it once voids an entire batch of work.**

### 8.1 Rule

**The orchestrator does not publish tasks. It relays and registers.**

- **The only source of a task is a human.** Either the human states it directly, or the human tells the
  orchestrator and the orchestrator relays it.
- **Forbidden**: filling an ambiguity of the human's instruction into a task · choosing a direction on
  the human's behalf · deciding "what a role should do now" · sending something because "it looks like
  it should be done".

### 8.2 When things are ambiguous

**Ask the human first; do not start.** Asking is far cheaper than guessing wrong.

| Situation | Correct action |
| --- | --- |
| Ambiguous instruction | ask a concrete question and wait; **do not start** |
| "Create a new role" | **creating the role is allowed** (name, permissions, skills, registration); **assigning work is not** |
| "Withdraw that thing" | **confirm the scope first**: withdraw the artifact? the identity? the registration? |
| You notice "something that should be done" | **register it as pending-decision, or ask** — **not a work order** |

### 8.3 Self-check

> **"Which sentence of the human's did I get this task from? What were the exact words?"**
> **Cannot answer ⇒ not allowed to assign it.**

### 8.4 Why it is the top priority

Observed: the human gave one instruction — "create the identity of a new role". The orchestrator read an
assessment artifact on its own, decided on the human's behalf what that role should do, and **assigned
work repeatedly** (picked a first task → picked a direction → overturned it and re-picked). The new role
produced **an entire batch** of models, renders and tools.

The human then voided the whole batch.

Two costs: ① the human's resources were spent on the orchestrator's guessed direction; ② because
"withdraw the artifacts" was misread as "withdraw the identity", another round was spent undoing.

**⇒ This is why single-task-source sits at the top of the priority list.**

---

## 9. Fan-out: sub-tasks you own

**Fan-out** = a role splitting a batch of parallelizable generation/batch jobs across sub-agents
**inside its own scope**. It is a different thing from cross-role collaboration, but shares the same
discipline.

| Item | Rule |
| --- | --- |
| Who may start it | **any role, within its own scope** |
| The request must carry | ① **the slice list**: input · **output path** · criteria ② whether slices must **converge on one criterion** ③ expected **concurrency and cost** (mandatory for pay-per-use) |
| Hard constraint 1 | **output paths must not overlap** — concurrent writes to one directory/file are a conflict |
| Hard constraint 2 | **every slice must be self-explanatory** — a sub-agent cannot see the initiator's context, so scope and criteria must be complete in the slice |
| Product ownership | products **return to the initiator**; the sub-agent's conclusions are relayed **verbatim, not re-judged** |
| Accountability does not move | **gate · visual check · landing · commit stay with the initiator** |
| Single-point commit | **sub-agents do not commit** (no version operations) — the initiator commits once, avoiding multi-head landing and accidentally picking up a peer's in-flight artifact |
| **Criteria are not parallel** | fan-out parallelizes **generation / batch runs only**; **never let N sub-agents each judge "acceptable"** — that yields N standards |
| Initiator's duties | ① relay verbatim without rewriting ② if slices overlap, criteria split or cost is unlisted ⇒ **fix the slices first** ③ register one row for reference |
| Cost attribution | pay-per-use fan-out: the initiator lists the cost and **asks the human themselves** |

> **"Criteria are not parallel" is the easiest to violate and the most insidious.** Two standards for
> one fact surface much later and cannot be attributed.

---

## 10. Turn discipline

| Rule | Explanation |
| --- | --- |
| **Deliver, then stop** | end the turn right after delivering. **Do not poll, wait or sleep for a reply** |
| **Do not hold everything waiting for a reply** | register the dependency as a blocker and push forward on what does not depend on it |
| **On receiving a delivery: process + register** | no receipt, no confirmation request, no verdict |
| **Do not chase a target that never answers** | record "no artifact returned" and move on |
| **Two non-converging attempts at one spot ⇒ stop** | change the approach or rewrite the section; do not retry identically |
| **Never put session ids into long-lived documents** | see §5.4 |

> **Why**: waiting for a reply is a "both sides stop" pattern, and delivery-is-completion means the peer
> **never needed to reply**. **Waiting is pure loss.**

---

## 11. Adoption order and degradation

**Do the things that prevent the most expensive failures first. Do not switch everything on at once.**

| Phase | Do | Cost of skipping |
| --- | --- | --- |
| **1 (required)** | ① **directed delivery primitive** with the two structured markers (§5.2) ② **default intent = notice** (fail-safe) ③ **delivery criterion = return value** (§5.3 requirement 4) ④ write **delivery-is-completion** into the role documents (§4) | collaboration is wrong from the start |
| **2** | ⑤ **exact commits**: commits must name paths; no "commit everything" default ⑥ write **re-read-and-redo on conflict** into the documents (§6) ⑦ **ownership table** (companion §3) — a machine-checkable whitelist, not good intentions | concurrent overwrites, facts lost without a trace |
| **3** | ⑧ **artifact index** machine generated + staleness-checkable (P4) ⑨ **board** on disk, each role editing only its rows (§7) | after compaction/restart nobody can say where things stand |
| **4** | ⑩ **session enumeration** including runtime state (P1) ⑪ **role-name addressing** with explicit failure on ambiguity (§5.4) ⑫ **single task source** written into role documents, with the self-check sentence (§8) | ghost targets, organizational drift |

### Degradation (when the framework lacks a capability)

| Missing | Degraded approach | Cost |
| --- | --- | --- |
| No wake/queue distinction | treat everything as queued; the target reads its inbox when it runs | worse latency, but **cheaper than an unwanted wake** |
| No delivery return value | require the primitive to return at least one write-success identifier, otherwise treat as undelivered and record it | cannot distinguish "not delivered" from "delivered but unread" |
| Cannot enumerate runtime state | skip the pre-delivery check; on failure record it and leave the artifact on disk | may deliver into an ended target (thrown away) |
| No session-bound role names | keep a **config file** mapping role name → stable identifier, **not committed** (it goes stale); forbid scattering ids elsewhere | one extra external config |

---

## 12. How `cross-chat` implements this contract

| Primitive / rule | Concrete implementation |
| --- | --- |
| **P1** session enumeration + runtime state | `cross-chat list` (prints `running, heartbeat Ns ago` / `idle`) and `cross-chat active`; programmatically `cc.sessions()`. Runtime state comes from the client's own ownership lock, not from a timer we run |
| **P2** directed delivery | `cross-chat send --to <role> --message "…" --intent notice\|work --wake queue\|wake` |
| **P2** marker: intent | `--intent` (default `notice`); the marker is written into the body as a canonical stamp line **and** recorded in the ledger, so the receiver never infers it from prose |
| **P2** marker: wake | `--wake queue` (default) = `acp/enqueueSessionMessage{inject:false}` — the hub returns `{enqueued:true, queueItemId}` and starts nothing itself; `--wake wake` = the streaming call that starts a turn now |
| **P3** delivery receipt | the `receipt` field of the result: the hub's `queueItemId` for a queued delivery, the stream message id for a waking one. Success is judged by this return value — never by reading the peer's inbox |
| **P4** artifacts | version control, as usual: the message carries only "path + one-line conclusion". The tool additionally appends every delivery to `<stateDir>/deliveries.jsonl` (local ledger) |
| **§5.3 req 2/3** no reply on notices, explicit wake | `--intent` separates "tell" from "act", and `--wake` keeps the decision to spend a turn of the peer's budget explicit |
| **§5.4** addressing | `cross-chat role bind <role> --to <target>` stores role → session id **in the local state directory (never committed)**; `--to` accepts role names, ids or unique titles, and **fails loudly on ambiguity**; a binding that points at a dead session fails instead of delivering into a ghost |
| **§10** deliver then stop | `wait` is opt-in (`--wait`); the default returns as soon as the delivery was accepted |
| **§4** delivery is completion | `send` prints the receipt; there is no acknowledgement concept anywhere in the tool |
| **§5.3 req 4** criterion ≠ inbox | the CLI never inspects the target's inbox to decide success; it reports the hub's return value and its own receipt |
