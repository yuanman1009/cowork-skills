# Role separation and responsibility boundaries

> **Scope**: several agent sessions working in parallel, each holding a different responsibility
> (orchestration, production, review…), needing stable agreements on *who owns what, what they may not
> touch, when they must ask the human, and what counts as delivered*.
> **No project specifics, no machine paths, no platform framework names.**
> **Companion document**: how messages travel, how delivery is judged and how a turn ends live in
> [DELIVERY-MECHANISM.md](DELIVERY-MECHANISM.md); this one is only about *roles and boundaries*.

Each table row below is an observed failure, not a hypothesis.

---

## 1. Failure → mechanism

| Failure / anti-pattern | Consequence | Mechanism |
| --- | --- | --- |
| The orchestrator fills in tasks and picks a direction | **the whole batch is voided**; the human's resources go the wrong way | single task source (§4) |
| The orchestrator performs acceptance | producer and judge in one seat; the boundary collapses immediately | three role classes (§2) |
| Skipping the escalation gate with "it doesn't block anything / it's in scope / build it and see" | wrong direction, rework | escalation gate (§5) |
| Asking with codes and internal jargon | the human cannot read it, the round is wasted, it must be asked again | how to ask (§5.4) |
| Splitting one question into two / re-asking something answered | wastes the human's rounds | how to ask (§5.4) |
| Starting work during the waiting period after asking | if the option is rejected, the work was wasted | escalation gate (§5.2) |
| Editing artifacts out of scope | **overwrites a peer's result without anyone noticing** | ownership (§3) |
| An ownership void nobody fills | **nobody can change it**; one stray artifact can block the flow forever | ownership (§3.3) |
| Recording "done" instead of "X self-reports done" | **unauditable** | delivery & acceptance (§6.3) |
| Writing change notes into a current-version-only artifact | the specification artifact is polluted into a history archive | ledger track separation (§8) |
| Changing only "the most obvious place" for a wording change | the **whole repository's wording splits** | ledger editing discipline (§9) |
| Relaying someone else's reading without going to the source | crossed numbers, misquotes | ledger editing discipline (§9) |
| Using "the sentence at the end of that row" as an anchor in a long-row ledger | **the table breaks** (old row truncated + new row off-table, both at once) | ledger editing discipline (§9) |
| Treating automated tests as experience acceptance | user-experience defects reach the human | human-check boundary (§10) |
| Treating an "internally consistent" recomputation as proof a reference value holds | the value may be externally absurd | two-layer consistency (§9.1) |

---

## 2. What a role is

**A role = one bundle of responsibilities**, defined by five things:

| Element | Meaning | Must be stated |
| --- | --- | --- |
| **Responsibilities** | what this role produces, what it is accountable for | ✅ |
| **Write scope** | which paths it may modify (**whitelist**) | ✅ **machine-checkable** |
| **Entry** | what it reads on start, how it restores context | ✅ |
| **Exit** | what form a delivery takes, where it lands | ✅ |
| **Escalation boundary** | what must stop and ask the human | ✅ |

**Two basic disciplines**:

1. **A role is a stable logical name; a session is a replaceable carrier.** Role names go into documents
   and boards; session ids do not.
2. **One context holds one role.** The same person may hold several roles, but **never let one session
   play two roles at once** — the boundary blurs and you cannot tell which hat caused an overreach.

### 2.1 The three role classes

| Class | Responsibility | Must **not** do |
| --- | --- | --- |
| **Orchestration / coordination** | registering and dispatching cross-role requests, task sequencing, **faithful progress records** | **produce business content**; **pass/fail, gate, bounce, or issue acceptance artifacts** |
| **Production** | produce within its write scope (specs, code, assets, data…) | edit others' scopes; place cross-role orders on its own |
| **Arbitration** | **the human**. Direction, trade-offs, keep/discard, look and feel, cost | — (the only final decision maker) |

> **Key distinction**: the orchestrator's output is a **record**, not a **verdict**. Making it "accept"
> work makes it producer and judge at once — the boundary collapses immediately.

**Who reviews**: technical review (spec conformance) belongs to **the owner role of that spec
self-reviewing**, or to a designated review role — **never to the orchestrator**.

---

## 3. Responsibility boundaries and ownership

### 3.1 Default rule

> **Whoever creates it owns it. Everyone else is read-only.**

### 3.2 A machine-checkable whitelist

Ownership **must be a machine-checkable path whitelist**, not good intentions.

| Requirement | Explanation |
| --- | --- |
| Each role gets a **list of write-allowed path prefixes** | before committing, validate "role + exact path" against the whitelist |
| Refusals must **attribute** | "that path belongs to role X" — so anyone can see who to talk to |
| **Shared directories** use "creator owns" | shared ≠ everyone may edit |
| **Rule sources** have a single owner | specification/contract artifacts have exactly one owner; others read-only |

### 3.3 Two structural holes that must be plugged

**Hole 1 — the ownership void.**
There will always be paths **no role's whitelist covers** (stray files in the repository root, a
mistakenly written temp file). Result: **nobody can change it** — one stray artifact can block the flow
permanently.

**Fix**: define a **fallback owner** (e.g. "stray files in the root belong to the orchestrator") and
write it into the whitelist rules.

**Hole 2 — ambiguous ownership of a shared directory.**
If two roles both "sometimes need" one shared directory, the practical outcome is mutual overwriting.

**Fix**: either assign the directory to a single owner and route the other side through a request, or
**explicitly schedule the order** of changes (companion §6).

### 3.4 The correct path when out of scope

Want to change an artifact outside your scope ⇒ **raise a cross-role request**; the orchestrator
registers it and dispatches it to a production role. **Do not edit it yourself.**

**Why**: an out-of-scope edit is one overwrite nobody notices — the original owner next edits from an old
version and reverts your change, or produces a merge nobody can attribute.

---

## 4. Where tasks come from (highest priority)

> **Violating this once costs an entire batch of work.**

### 4.1 Rule

**The orchestrator does not publish tasks. It relays and registers.**

- **The only source of a task is a human.** Either the human states it directly, or the human tells the
  orchestrator and the orchestrator relays it.
- **Forbidden**: filling an ambiguity of the human's instruction into a task · choosing a direction on
  the human's behalf · deciding "what a production role should do now" · sending something because "it
  looks like it should be done".

### 4.2 Ambiguity and edge cases

| Situation | Correct action |
| --- | --- |
| Ambiguous instruction | **ask first; do not start** |
| "Create a new role" | **creating the role is allowed** (name / permissions / skills / registration); **assigning work is not** |
| "Withdraw something" | **confirm the scope first**: withdraw the artifact? the identity? the registration? |
| You notice "something that should be done" | **register it as pending-decision or ask** — **not a work order** |

### 4.3 Self-check

> **"Which sentence of the human's did I get this task from? What were the exact words?"**
> **Cannot answer ⇒ not allowed to assign it.**

### 4.4 Why it is the top priority

Observed: the human gave one instruction — "**create the identity of a certain role**". The orchestrator
read an assessment artifact on its own, decided on the human's behalf **what that role should do**, and
**assigned work repeatedly** (picked a first task → picked a direction → overturned it and re-picked).
That role produced **an entire batch** of models, renders and tools on that basis.

The human then voided **the whole batch**.

Two costs: ① the human's resources were spent on the orchestrator's **guessed direction**; ② because
"withdraw the artifacts" was misread as "withdraw the identity", another round was spent undoing.

**⇒ This is why single-task-source is the highest-priority clause.**

---

## 5. The escalation gate

### 5.1 Trigger

Whenever a choice would **materially change** any of the following, and **the current rule source gives
no unique answer** ⇒ **ask the human first**:

look and feel / user experience · gameplay or business behaviour · direction and style · delivery scope ·
cost · **the fate of existing artifacts**

### 5.2 Procedure

| Step | Action |
| --- | --- |
| 1 | **land the pending-decision artifact first**: options / consequences / recommendation |
| 2 | **during the waiting period, do not land specifications and do not start production** |
| 3 | execute only after the human **names an option or explicitly authorizes**; **blanket authorizations must state their scope** |

### 5.3 Phrases that may not be used to skip it

Not allowed as reasons to skip: "this doesn't block other work" · "it's in scope" · "build it and see" ·
"autonomy was already granted".

Three exceptions where the gate does not apply: the rule source already gives a unique answer · purely
internal, reversible implementation details · mechanical execution inside an established acceptance scope.

### 5.4 How to write the question itself

**The gate decides *what* to ask; it says nothing about *how* — and a badly written question makes the
gate worthless.**

**Four pre-checks before asking**:

| # | Question | Cost of skipping |
| --- | --- | --- |
| 1 | **Is it already done?** — read the **whole** status cell, do not pattern-match "todo / pending" (status cells are often "state + how far along") | politely asking about finished work |
| 2 | **Can I answer it myself?** — does the current rule source / ledger / an effective ruling give a unique answer | asking something already answered |
| 3 | **Is it one thing?** — one question at a time; **merge** two questions whose answers must move together | splitting one thing into two, wasting a human round |
| 4 | **Was it answered elsewhere?** | re-asking something already answered |

**Three hard requirements on the text**:

| Requirement | Counter-example | Good example |
| --- | --- | --- |
| **No codes, ids or file locations** — describe the thing itself | "shall we proceed with item A-12?" | "how many rooms per dungeon run?" |
| **Options carry their own meaning** — never "option A / option B" | "A or B?" | "**1 room only** / **2 rooms (staging + boss)**" |
| **Give a recommendation with one line of reasoning, but do not decide for them** | a bare list of options | "I suggest 2 rooms, because the boss needs a buffer before it" |

**Why these are hard requirements**: an observed round failed — codes ("A / B") plus internal jargon —
**the human could not read it, the round was wasted and had to be asked again**.

---

## 6. Delivery and acceptance

### 6.1 What "delivered" means

**Producer lands the artifact + delivers one notice to the orchestrator = that batch is complete.**
No side confirms anything. See companion §4.

### 6.2 Three lines of defence, not manual acceptance

| Line | Explanation |
| --- | --- |
| **① Automated gate** | the unified check run before commit / landing. **The producer runs it**; the orchestrator does not re-run it as a separate seat |
| **② Downstream consumer** | **whoever uses it checks it** — cross-party inconsistency surfaces at consumption; responsibility sits with the consumer |
| **③ The human's face** | artifacts whose criteria belong to a human are **relayed** by the orchestrator. **Relaying is routing, not acceptance** |

The orchestrator's lateral view is kept as a **low-frequency health check**: it does not block delivery,
does not pass/fail, and only reports contradictions it notices.

### 6.3 Record semantics

The orchestrator records: **"X self-reports completion (date · artifact path · commit)"**.

**Forbidden acceptance words**: passed / accepted / verified.

**Reason**: what is recorded is "X says it is done", not "I confirm it is done". The difference only
shows its value when someone traces back.

### 6.4 Delivery and closure are separate

**A delivery only ends the producer's turn — it does not close the human-acceptance item of a feature.**

The board's "delivery evidence" and "not human-checked" states are updated before delivering; the
orchestrator **records faithfully and never removes a human-check tag on someone's behalf**.

### 6.5 Where defects go

| Defect type | Goes to |
| --- | --- |
| Implementation defect | back to whoever produced the implementation |
| Rule problem | back to the spec owner for revision |

**The orchestrator does not bounce deliveries** — on noticing a doubt: **record it as-is + note it +
report to the human**.

---

## 7. Batches and rhythm

| Item | Rule |
| --- | --- |
| **One batch = one dispatch = one report** | after the report **stop and let the human look**; do not roll into the next batch on your own |
| **Three-part report** | **delivered / accepted / outstanding** |
| **Outstanding items are never dropped without a record** | record them into the next batch or a gap ledger |
| **Run one role through a full loop before scaling out** | do not start every role at once |
| **Stop when the job is done** | follow the established batch order; do not widen scope |
| **Synchronize on closure, not per exchange** | triggers: a process was established / a phase closed / one end-to-end job finished completely. **Not triggers**: every conversation, mid-flight assessments and round trips, anything not landed |
| **Report landed facts + commit ids** | not "what I am doing". **The orchestrator's value is an accurate ledger, not knowing a lot** |

**Executing "synchronize on closure"**: when the orchestrator is not running, use a **queued delivery +
notice** (no wake, no budget consumed) and say so in the body: "no reply needed, no dispatch needed,
purely informational".

---

## 8. Ledger and change-record track separation

**Different kinds of information go into different artifacts.** Mixing tracks is the main source of "two
standards for one fact".

| What | Where | Nature |
| --- | --- | --- |
| **Specifications / rules / contracts** | the rule source (single source) | current version only: replace in place, **no change notes, no trail, no explanation** |
| **Rulings / decisions** | decision ledger | **append-only** |
| **Reasoning** | change record | "why it changed" goes here |
| **Gaps / to be filled** | gap ledger | updated when settled |
| **Task owner / progress / acceptance** | task board | see companion §7 |
| **Narration / retrospective / assessment** | report directory | **descriptive, not a basis for decisions** |
| **History** | version control | full history |

**Three-way split**: **specifications → rule source; work items → work item directory; narration →
report directory.**

**Indexes and derived artifacts**: machine generated, regenerated when the source changes; when one
reports "stale", **re-run it once before judging** (it may be a timing artifact of concurrent landing).

---

## 9. Engineering discipline for editing ledgers

Long-row ledgers (rows of thousands of characters) are where this kind of collaboration breaks most
often. Every line below was learned the hard way.

| # | Pitfall | Countermeasure |
| --- | --- | --- |
| 1 | **Using "the sentence at the end of that row" as an anchor** — description columns often quote other rows, so it matches somewhere inside the row ⇒ **the insertion lands mid-row: the old row is truncated and the new row is off-table, both broken at once** | pick an anchor that is **unique and near the end of that row**, and **verify with a tool that it occurs exactly once in the file**; or **edit by line index** (read the file → change by index → write back) |
| 2 | A bare section number read as a self-reference | when citing, **include the artifact name**, or write "section N" |
| 3 | Not running the gate after editing | **always run the gate after a table edit**; on "off-table / wrong column count" **roll back and redo, never patch in place** |
| 4 | Changing only "the most obvious place" | **wording changes are followed through**: scope = **every artifact containing that wording**, not "the artifacts I happened to touch this round". Procedure: reverse-scan the repository → separate "live rules" from "historical narration" → change each live rule, leave narration alone → sweep each artifact fully → run the gate |
| 5 | Relaying readings from elsewhere | **go back to the source**. Four kinds always require source reads and a written-down scope: **quotes** (re-check the original before relaying someone's reading) · **counts** (number-of-items counts must state *in which artifact* you counted) · **ownership** (check the whitelist, never "this table looks like it belongs to X") · **directories** (when completing a directory/index/list, **verify each name against disk**) |
| 6 | Doing destructive operations directly | deleting rows / editing tables / moving files / bulk replace: **dry-run on the real file, assert the match count and line numbers, then write** |

### 9.1 The "two-layer consistency" criterion

When someone asks you to treat "this recomputation matches the specification/data digit for digit" as
proof, **first ask: does it verify internal or external consistency?**

| Type | Meaning |
| --- | --- |
| **Internal consistency** | the numbers lock together and are not miscalculated |
| **External consistency** | substituting the value into the system's other quantities still makes sense |

**An internally consistent recomputation alone cannot support a ruling on a reference value.** Reference
value rulings **require one external cross-check**.

Criterion sentence: **"If I take this value, what do three existing dimensions become?"**

---

## 10. Boundary between human checks and automation

| Item | Rule |
| --- | --- |
| **Human-check gate** | user-operable features are handed to a human in stage batches; **one human check may cover several deliveries of the same version**, updating only the items explicitly checked |
| **No conclusion = not human-checked** | automated tests, commits and receipt do **not** substitute for experience checks |
| **Pass to close** | failing means rework; a **new version** that affects the feature is human-checked again |
| **Closure basis for supporting deliveries** | documentation, tooling and supporting deliveries without an independent user-facing entry point **close on technical evidence**, without demanding item-by-item human operation, and **without pretending** they passed |
| **Human-check evidence** | record: the human's conclusion, date, **actual checked scope and version / where it can be checked**. **Approving the start or approving a plan ≠ the product passing** |
| **Prepare an operable entry** | the owner prepares a coherent entry point for stage acceptance; supporting mechanisms provide technical evidence and coverage boundaries, **not an unbounded item-by-item check list for the human** |
| **Aesthetics belong to the human** | **is it pretty / does it look like the reference / can you read it ⇒ the human**, never judged on their behalf |
| **But technical image verification is allowed** | anyone may use **measurement** to produce **reproducible numbers** (blank rows, centring offset, pixel alignment, colour values, dimensions, bounding boxes) and rule on the technical items. **What is forbidden is "it looks good" by feel, not "read the image and compute numbers"** |

---

## 11. Landing checklist

### Three things that must exist

1. **Role list**: for each role — responsibilities / write whitelist / entry / exit / escalation boundary.
2. **Ownership whitelist table**: machine-checkable; **including a fallback owner** (plugging the
   ownership void).
3. **Discipline text for single task source and the escalation gate**: with the self-check sentence, the
   four pre-checks and the three text requirements.

### Add progressively

4. The delivery-is-completion wording + the three lines of defence (§6).
5. The ledger track separation table (§8).
6. The long-row ledger editing discipline (§9).
7. The human-check / automation boundary (§10).

### When the mechanism is working

- Pick any delivered artifact and you can **immediately say**: who produced it, under which rule, where
  it is registered, and whether anyone checked it.
- Ask any role "what may you do, what may you not touch" and **the answer matches the documents**.
- When a disagreement appears, you can locate **who should change what without holding a meeting**.
- A new session can **start working from the on-disk state** without interrogating the previous session.

---

## 12. How `cross-chat` implements this contract

| Rule | Concrete implementation |
| --- | --- |
| Role = stable logical name; session = replaceable carrier | `cross-chat role bind <role> --to <session>` keeps the mapping in the **local state directory**, never in version control; documents and boards carry role names only |
| Roles resolve to exactly one conversation; ambiguity must fail | `--to <role>` resolves through the binding, then id → unique prefix → unique title; **ambiguity throws** instead of picking one |
| Stale identity must not quietly "succeed" | a binding pointing at a session the client no longer knows makes delivery **fail loudly** (no ghost-target delivery) |
| Orchestration records, never judges | `send` returns a receipt and appends the delivery to the local ledger with `intent`/`wake`/`from`/`ticket` — that is the "X self-reported (date · artifact · id)" row |
| "Delivered / accepted / outstanding" reporting | the ledger (`deliveries.jsonl`) is machine-readable, so a batch report can be generated instead of remembered |
| Notices that should not consume a peer's budget | `--intent notice --wake queue`: the hub returns a queue item id and starts no turn, so a status report can be delivered without spending the peer's budget |
| Delivery is completion, no acknowledgement hop | there is no receipt/confirm primitive anywhere in the tool; the receipt *is* the return value |
| Do not wait for peers | `wait` is explicitly opt-in (`--wait`); the default ends the turn as soon as delivery is accepted |
| Ownership as a lock, not etiquette | the tool never writes into another role's conversation or artifacts; it only delivers messages and reads transcripts |
