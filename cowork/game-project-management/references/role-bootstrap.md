# Standing up the team

## 1. One charter per role

Fill `assets/role-charter.md` for every role **before** it starts work. All five parts, or the boundary
will blur later:

| Part | Test of a good entry |
| --- | --- |
| Responsibilities | a peer can say what you produce without asking you |
| Write scope | a machine can check "role + path" and refuse, with attribution |
| Entry | a fresh conversation can start from disk without interrogating the previous one |
| Exit | "delivered" is unambiguous: artifact landed + one notice sent |
| Escalation boundary | the specific choices that must be asked, listed, not implied |

## 2. Ownership whitelist with a fallback owner

Fill `assets/ownership-whitelist.md`. It must be machine-checkable, and it must contain the
**fallback owner** line — without it the first stray file blocks everyone.

- One owner per path prefix per role.
- Shared directories: single owner, others route requests through the orchestrator.
- Rule sources (specs, contracts): exactly one owner; everyone else read-only.
- Refusals attribute: *"that path belongs to the art role"*.

## 3. Roles to start with (typical game production)

| Role | Class | Typical write scope | Notes |
| --- | --- | --- | --- |
| orchestrator | orchestration | the board, the ledgers, the root fallback | never produces content, never accepts work |
| game design | production | `design/**` | owns the spec for gameplay behaviour |
| art / visual | production | `art/**`, `assets/**` | owns look-and-feel *artifacts*; the human still judges looks |
| audio | production | `audio/**` | |
| engineering | production | `src/**`, `tools/**` | runs the automated gate |
| review / QA | production (review) | its report directory only | reviews against the spec owner's criteria |

**Start with one role running a full loop** (charter → work → artifact → notice → record) before
standing up the rest. Scaling out first is how the ownership table turns out to be wrong.

## 4. Standing-up checklist

1. Charter written for the role, escalation boundary included.
2. Ownership whitelist updated, fallback owner present.
3. Role bound to a conversation by **role name** (cross-session-delivery: `cross-chat role bind`).
4. The role's first task **came from the human** — and the orchestrator can quote the sentence.
5. Entry point written: what to read first (board rows, charter, rule source).
6. Exit form written: which artifact path, which notice, to whom.
7. Board rows created (creating a row does **not** authorize work to start).

## 5. Creation vs. assignment

"Create a new role" authorizes **creation**: name, permissions, skills, registration, charter.
It does **not** authorize work. The first task needs its own instruction from the human — that is the
single most expensive rule in this document (see `SKILL.md`, "Single task source").

## 6. Keeping the role list honest

- A role that is not in the charter list must not deliver artifacts under a new path prefix.
- When a role's scope genuinely must grow, the human authorizes the change and the whitelist is updated in
  the same batch — never "just this once".
- Retiring a role: confirm the scope first (retire the artifact? the identity? the registration?), then
  remove the binding and revoke the whitelist entries.
