# Activation and usage

What the orchestrator does the moment this skill activates, and what it should tell the human. Read
together with `SKILL.md` (rules) — this file is the *how to stand it up*.

## 1. Activation sequence

| Step | Action | Command / artifact |
| --- | --- | --- |
| 1 | Announce the seat: this conversation is the project-management side | one sentence, in the human's language |
| 2 | See what exists: conversations, runtime state, bound roles | `cross-chat list` |
| 3 | Ask the human one consolidated round (below) and **wait** | — (no production, no dispatch) |
| 4 | Bind role names to conversations | `cross-chat role bind <role> --to "<title>"` |
| 5 | Create the team files from this skill's templates | `team/roles.md`, `team/ownership.md`, `team/board.md`, `team/decisions.md`, `team/gaps.md` |
| 6 | Print the usage guide, then stop and wait for the first task | §4 below |

**Why the human confirms the mapping instead of the agent guessing**: a conversation is a replaceable
carrier. Binding the wrong one creates a target that looks valid and receives nothing, and the mistake is
invisible until someone chases a task that was never delivered.

## 2. The one question round (what to ask, how to ask it)

Follow the question rules of this skill: **no codes, no file paths, every option carries its own meaning,
one recommendation each**. One round, at most three questions:

1. **Which window is this?** "We are in the conversation titled X — is that the project-management
   window? (Propose the most likely title you can see.)"
2. **Who holds which role?** "Here are the conversations I can see: `<titles>`. Which one is design / art /
   audio / engineering / review? You can also tell me later — I will keep a mapping by role name."
3. **Where do the team files live?** "I suggest a `team/` folder in this project: roles, ownership,
   board, decisions, gaps. Would you rather put it somewhere else?"

Do not ask which model to use, how to name a role, or anything the rule source already answers. Do not
split one matter into several questions.

## 3. Scaffolding the agent creates

| File | Built from | Holds |
| --- | --- | --- |
| `team/roles.md` | `assets/role-charter.md` (one block per role) | responsibilities · write scope · entry · exit · escalation boundary |
| `team/ownership.md` | `assets/ownership-whitelist.md` | machine-checkable path whitelist + **fallback owner** (plugs the ownership void) |
| `team/board.md` | `assets/task-board.md` | one row per task: owner · execution · acceptance · next step · evidence |
| `team/decisions.md` | — | rulings, append-only |
| `team/gaps.md` | — | open gaps / to be filled |

Rule sources (specs, contracts) stay single-owner and are **not** duplicated into `team/`. Reasoning
belongs in a change record; narration belongs in a report directory — never in the rule source.

Creating this structure is **standing up a team** ("create the role" is allowed). It does **not**
authorise work: the first task must come from the human.

## 4. Usage guide to hand the human

Say it briefly, in the human's language; keep the numbered shape so it reads like instructions:

1. **This window is the project-management side.** Bring tasks here in plain words. It records them,
   splits them into a batch, dispatches to the role windows and reports back. It does not invent tasks and
   does not judge output — that stays with you.
2. **Give every role window this skill too.** Install both skills once for the user
   (`codely skills install <skill-folder> --scope user`, then `/skills reload`), then in each role
   conversation say which role it holds. Each window then keeps its own charter, write scope, entry and
   exit.
3. **Roles are addressed by name, not by session id.** The orchestrator keeps the name → conversation
   mapping locally; the team documents only ever contain role names.
4. **Give the first task in your own words** — one line is enough ("make the first level playable"). It
   becomes a batch with deliverables, owners and evidence paths. Then you get a three-part report:
   **delivered / accepted / outstanding**, and it stops for you to look.
5. **Expect to be asked** about direction, look and feel, scope, cost, keep-or-discard. The gate is
   deliberate: it is cheaper than guessing wrong.
6. **Progress lives on disk** in `team/`. Anyone can answer "who produced this, under which rule, where
   is it registered, was it checked" without asking a conversation.
7. **One batch at a time.** After each report the team waits for you; it does not roll on by itself.

## 5. Onboarding a role window (what the human does there)

1. Say which role it holds, e.g. "you are the art role".
2. The role window writes its own five-part charter (or the orchestrator writes it and the window
   confirms), registers it, and states its write scope.
3. It reads, at entry: its own board rows, the current rule source, pending-decision artefacts addressed
   to it, and any pending-orders file listed in its charter.
4. It delivers as: artifact landed at `<path>` + one notice to the orchestrator naming that path. No
   acknowledgement is requested or expected.
5. It never edits outside its write scope; out-of-scope needs go back as a request to the orchestrator.

## 6. Minimum viable team

Start smaller than feels natural (one role through a full loop before scaling out):

| Wave | Conversations | Why |
| --- | --- | --- |
| 1 | orchestrator + one production role | proves charter → artifact → notice → record with almost no coordination cost |
| 2 | + review/QA role | introduces a second pair of eyes and the ownership whitelist's first real test |
| 3 | + remaining production roles | parallel batches, board discipline, batch rhythm |

## 7. Standing-start checklist (per session)

1. Read the board rows this role owns.
2. Read the rule source and any pending-decision artefact addressed to this role.
3. Read any pending-orders file named in the charter.
4. Trust the on-disk values over session memory after a compaction or a restart.

## 8. Is the setup working?

- Pick any delivered artifact and you can immediately say who produced it, under which rule, where it is
  registered and whether it was checked.
- Ask any role "what may you do, what may you not touch" and the answer matches `team/roles.md` and
  `team/ownership.md`.
- A disagreement can be routed to its owner without a meeting.
- A replaced conversation can start from `team/` alone, without interrogating its predecessor.
