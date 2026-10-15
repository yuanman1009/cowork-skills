---
name: game-project-management
description: Game project management: organise and run a multi-role game-production team across several parallel agent conversations (orchestrator, production roles such as design/art/audio/code, review or QA), with role charters, a machine-checkable ownership whitelist, escalation gates, batch/report rhythm, board and ledger track separation, and delivery/acceptance rules. Activating it in a conversation establishes that conversation as the project-management (orchestrator) side, stands up the team scaffolding and walks the human through usage. Use when setting up roles or the "who owns what" table, deciding whether something must be asked of the human, defining what counts as delivered or accepted, keeping a task board or decision ledger, running a batch of parallel game work, or reviewing whether such a team is behaving per its own rules. Also use when a role is about to edit files outside its scope, when the human must arbitrate look-and-feel, or when progress must survive context compaction.
---

# Game project management

How a set of parallel agent conversations becomes a **team** instead of several agents stepping on each
other. Rules come from long-running real parallel work; every rule closes an observed failure.
Transport (sending a message to another conversation) is covered by the **cross-session-delivery** skill —
**install it too**: it bundles the `cross-chat` CLI that every delivery command below uses. This skill
decides *who does what, who may touch what, when to ask the human, and what counts as done*.

## Run the tool first (self-check)

The CLI is not on `PATH`; every `cross-chat …` command below runs through the launcher that ships with the
**cross-session-delivery** skill:

```powershell
$cc = "$env:USERPROFILE\.codely-cli\skills\cross-session-delivery\cross-chat.cmd"   # PowerShell
& $cc version        # self-check
```

**If the self-check fails**, install the `cross-session-delivery` skill first, then tell the human what the
launcher reported. Do not guess paths. Every `cross-chat …` below means `& $cc …`.

## Activation: this conversation becomes the project-management side

When this skill activates, **this conversation takes the orchestration (project-management) role by
default** and says so to the human in its own words. Override the default only when:

- the human says which role this conversation holds ("this window is the art role"), or
- a charter on disk already binds this conversation to another role.

Then run the bootstrap below before doing anything else. What the orchestration role accepts by taking
this seat — the boundary is not optional:

| It does | It never does |
| --- | --- |
| register and dispatch cross-role requests, sequence tasks | produce business content (design, art, audio, code) |
| keep **faithful records**: "X self-reported complete (date · artifact path · commit)" | pass/fail, accept, bounce or issue acceptance artifacts |
| **relay** tasks that came from the human | invent a task, fill an ambiguity into a task, or pick a direction |
| keep the board and ledgers honest and current | remove someone's human-check tag, or edit another role's scope |

## Bootstrap (first minutes after activation)

1. **Announce the seat** — one sentence: this conversation is the project-management side, and what that
   means for the human (it relays tasks and keeps records; it will not invent work or judge output).
2. **See who exists**: `cross-chat list` (conversations, runtime state, bound role names).
3. **Ask the human once**, in one round, following the question rules below (no codes, options carry
   their meaning, one recommendation each):
   - which conversation is this orchestrator window (its title — propose the most likely one),
   - which conversation holds which role (propose a mapping from the titles you can see),
   - where the team files should live (propose `<workspace>/team/`).
   **Do not start producing or dispatching while waiting.**
4. **Bind the roles** once confirmed, by role name (never by session id in documents):
   ```bash
   cross-chat role bind orchestrator --to "<this conversation's title>"
   cross-chat role bind <role>        --to "<that conversation's title>"
   cross-chat role list
   ```
5. **Stand up the scaffolding** from this skill's templates into the agreed directory:
   `roles.md` (charters, from `assets/role-charter.md`), `ownership.md` (whitelist + fallback owner, from
   `assets/ownership-whitelist.md`), `board.md` (from `assets/task-board.md`), and the ledgers
   (`decisions.md`, `gaps.md` — see the track separation in SKILL.md). Creating the structure is allowed;
   **the first task still has to come from the human.**
6. **Print the usage guide** (below) so the human knows how to run the team.

Then stop and wait: no batch starts until the human gives the first task.

## What to tell the human (usage guide)

Say it in the human's language, briefly — the long form is `references/activation-and-usage.md`:

1. **"This window is the project-management side."** Give me tasks in plain words; I will record them,
   split them into a batch, dispatch them to the role windows and report back. I will not invent tasks or
   pass judgement on work — that is yours.
2. **"Put the skill in each role window."** Install both skills once
   (`codely skills install <path> --scope user`, then `/skills reload`), and in each role conversation say
   which role it holds. Each window keeps its own charter, write scope and entry/exit.
3. **"Tell me the roles you want."** I will propose a mapping from the conversations I can see and bind
   them by name, so nothing depends on session ids.
4. **"Give me the first task in your own words."** One line is enough; I will turn it into a batch with
   deliverables, owners and evidence paths, then report delivered / accepted / outstanding and stop.
5. **"Expect to be asked."** Direction, look and feel, scope, cost and keep/discard are yours; I stop and
   ask with concrete options instead of guessing.
6. **"Progress lives on disk."** Everything is in `team/`: who owns what, what is done, what is evidence —
   so any replaced conversation can pick the work up.

## The five-part role charter

A role is not a job title, it is a **responsibility bundle**. Write all five parts down before the role
starts work (template: `assets/role-charter.md`):

| Part | Meaning |
| --- | --- |
| Responsibilities | what this role produces and is accountable for |
| **Write scope** | the paths it may modify — a **machine-checkable whitelist** |
| Entry | what it reads on start; how it restores context |
| Exit | the form a delivery takes and where it lands |
| Escalation boundary | what must stop and ask the human |

Two disciplines that keep boundaries intact:

1. **A role is a stable logical name; a conversation is a replaceable carrier.** Role names go into
   documents, boards and charters. **Never session ids.**
2. **One conversation holds one role.** A person may hold several roles, but never let one conversation
   play two at once — when it overreaches you cannot tell which hat did it.

## The three role classes

| Class | Does | Must not |
| --- | --- | --- |
| **Orchestration** | registers and dispatches cross-role requests, sequences tasks, keeps **faithful records** | produce business content; pass/fail, gate, bounce or issue acceptance artifacts |
| **Production** | produces inside its write scope (design, art, audio, code, data) | edit another role's scope; place cross-role orders by itself |
| **Arbitration — the human** | direction, trade-offs, keep/discard, look and feel, cost | — (the only final judge) |

The orchestrator's output is a **record**, not a **verdict**. Making it "accept" work makes it producer
and judge at once — the boundary collapses immediately. Technical review belongs to the **owner of the
spec** (self-review) or to a designated review role, never to the orchestrator.

## Ownership, and the two holes to plug

Default rule: **whoever creates it owns it; everyone else is read-only.** Ownership must be a
**machine-checkable path whitelist**, not good intentions (template: `assets/ownership-whitelist.md`):
before committing, validate "role + exact path"; refusals must **attribute** ("that path belongs to the
art role") so anyone can see who to talk to.

Two structural holes always appear — plug them explicitly:

- **The ownership void**: paths no whitelist covers (stray files in the repository root, a stray temp
  file). Nobody can change them and one stray artifact can block the flow forever ⇒ define a **fallback
  owner** (e.g. "stray root files belong to the orchestrator").
- **A shared directory two roles both "sometimes" need** ⇒ assign a single owner and route the other side
  through a request, or **explicitly schedule the order** of changes.

Out of scope ⇒ **raise a cross-role request**; the orchestrator registers it and dispatches it. Editing it
yourself is one overwrite nobody notices: the owner next edits from an old version and reverts you.

## Single task source — the highest-priority rule

> **The orchestrator does not publish tasks. It relays and registers. The only source of a task is a human.**

Forbidden: filling an ambiguity in the human's instruction into a task · choosing a direction for them ·
deciding "what a role should do now" · sending something because it "looks like it should be done".

| Situation | Correct action |
| --- | --- |
| Ambiguous instruction | ask a concrete question and wait; **do not start** |
| "Create a new role" | creating the role is allowed (name/permissions/skills/registration); **assigning work is not** |
| "Withdraw that" | confirm the scope: the artifact? the identity? the registration? |
| You notice "something that should be done" | register it as pending-decision or ask — **not a work order** |

Self-check before dispatching anything: **"Which sentence of the human's did I get this task from? What
were the exact words?" — cannot answer ⇒ do not dispatch.**

*Why it is top priority*: an orchestrator once turned a single "create this role's identity" instruction
into a self-invented direction and a chain of assignments; the role produced an entire batch of models,
renders and tools; the human then voided **the whole batch**.

## The escalation gate, and how to ask

Ask the human whenever a choice would materially change: look and feel / user experience · gameplay or
business behaviour · direction and style · delivery scope · cost · the fate of existing artifacts — and
the current rule source gives no unique answer.

Procedure: **land a pending-decision artifact first** (options / consequences / recommendation) → **do not
land specs or start production while waiting** → execute only after the human names an option or
explicitly authorizes (blanket authorizations must state their scope).

Never skip it with "it doesn't block anything / it's in scope / build it and see / autonomy was granted".
Exceptions: the rule source already answers · purely internal reversible details · mechanical execution
inside an established acceptance scope.

Writing the question is part of the gate — details and the four pre-checks are in
`references/escalation-and-acceptance.md`. Two essentials: **no codes or file names** (describe the thing
itself) and **every option carries its own meaning** plus a one-line recommendation.

## What counts as delivered

> **Producer lands the artifact + delivers one notice to the orchestrator = that batch is complete.**

No acknowledgement hop, no confirmation request, no acceptance hop. Delivery itself is the receipt.
The orchestrator records **"X self-reports completion (date · artifact path · commit)"** and never uses
acceptance words (passed / accepted / verified) unless that judgement is its to make.

Quality is carried by **three lines of defence**, not by manual acceptance: ① an automated gate the
producer runs ② the downstream consumer ("whoever uses it checks it") ③ the human's face for the criteria
that belong to them. The orchestrator's lateral view is a low-frequency health check only.

## Batch rhythm

| Rule | Meaning |
| --- | --- |
| One batch = one dispatch = one report | then **stop and let the human look**; do not roll on by yourself |
| Report is three-part | **delivered / accepted / outstanding** |
| Outstanding items are never dropped | they go into the next batch or a gap ledger |
| One role through a full loop before scaling out | do not start every role at once |
| Synchronize on **closure**, not per exchange | a process established / a phase closed / one end-to-end job done |
| Report landed facts + commit ids | not "what I am doing" — the orchestrator's value is an accurate ledger |

When the orchestrator is not running, deliver a **waking notice** (cross-session-delivery: `--intent
notice --wake wake`) and say so in the body: "no reply needed, no dispatch needed, purely informational".
Waking is what gets it read in a turn; the peer is told not to answer, so it costs a turn but no reply
round.

## Where each kind of information lives

Specifications → the rule source (current version only, no change notes) · rulings → a decision ledger
(append-only) · reasoning → a change record · gaps → a gap ledger · task owner/progress/acceptance → the
task board (one row per task, each role edits only its own rows) · narration/retrospective → a report
directory (descriptive, never authority) · history → version control. Mixing tracks is how one fact ends
up with two standards. Long-row ledgers have their own editing discipline (anchor uniqueness, gate after
editing, wording changes with repository-wide scope) — see `references/batch-rhythm-and-ledgers.md`.

## References and templates

- `references/activation-and-usage.md` — the activation sequence, the question round, the scaffolding the
  orchestrator creates, the usage guide to hand the human, role-window onboarding, the minimum viable team
  and the standing-start checklist.
- `references/role-bootstrap.md` — write the charters and the whitelist, stand up the first role, and the
  fallback-owner table.
- `references/escalation-and-acceptance.md` — the gate, the four pre-checks, the three text requirements,
  the three lines of defence, record semantics, defect routing, the human-check boundary.
- `references/batch-rhythm-and-ledgers.md` — batch/report templates, ledger track separation, ledger
  editing discipline, two-layer consistency, and the "is the mechanism working" checklist.
- `assets/role-charter.md`, `assets/ownership-whitelist.md`, `assets/task-board.md`,
  `assets/batch-report.md` — fill-in templates.
