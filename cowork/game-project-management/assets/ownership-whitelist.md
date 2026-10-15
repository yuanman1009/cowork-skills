# Ownership whitelist

Machine-checkable: validate **role + exact path** before every commit. A refusal must attribute the real
owner.

| Role | Allowed path prefixes | Notes |
| --- | --- | --- |
| orchestrator | `board/**`, `ledgers/**`, `<root stray files>` | records only; produces no content |
| game-design | `design/**` | owns gameplay specs (single owner) |
| art | `art/**`, `assets/**` | visual artifacts; the human still judges looks |
| audio | `audio/**` | |
| engineering | `src/**`, `tools/**`, `tests/**` | runs the automated gate |
| review | `reports/review/**` | reviews; never edits the artifact under review |

## Rules

1. **Whoever creates it owns it; everyone else is read-only.**
2. **Rule sources** (specs, contracts) have **exactly one owner**; others read-only.
3. **Shared directories**: assign one owner and route the other side through a request, or schedule the
   order of changes explicitly. Never "both sometimes need it".
4. **Fallback owner** (plugs the ownership void):
   - stray files in the repository root → `orchestrator`
   - unlisted paths → **blocked, attributed to the human**: do not invent an owner on your own

## Validation snippet

```
validate(role, path):
  if any prefix in whitelist[role] is a prefix of path: allow
  else: deny with "that path belongs to <owner-of-matching-prefix | orchestrator fallback>"
```

## Change log for this table

| Date | Change | Authorized by |
| --- | --- | --- |
| | | human instruction: "<exact sentence>" |
