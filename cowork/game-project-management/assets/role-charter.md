# Role charter: <role-name>

> One conversation holds one role. Role names go into documents; session ids do not.

## 1. Responsibilities

- Produces:
- Accountable for:
- Explicitly **not** theirs:

## 2. Write scope (machine-checkable whitelist)

Allowed path prefixes:

- `<path/prefix/>`

Rules:

- Who creates it owns it; everyone else is read-only.
- Refusal must attribute: "that path belongs to `<role>`".
- Out of scope ⇒ raise a cross-role request; never edit it directly.

## 3. Entry (how this role restores context)

- Read first:
  1. its own rows in the task board
  2. the current rule source (specification/contract)
  3. the pending-decision artifacts addressed to it
  4. any pending-orders file listed here (conditions that must fire later live **in a file you read at
     entry**, never in a chat promise — a message can only ask for behaviour in the turn it creates)
- On-disk state wins over session memory.

## 4. Exit (what a delivery looks like)

- Artifact lands at:
- Notice sent to: `<orchestrator role>` with `--intent work --wake wake` (if it must act) or `--intent
  notice --wake wake` (report only; waking gets it read, the body says no reply is needed)
- Delivery is completion: **no acknowledgement is requested or expected**.

## 5. Escalation boundary (must ask the human)

- <choice> · <choice> · <choice>

Do **not** skip the gate with "it doesn't block anything / it's in scope / build it and see".

## 6. Role class

`orchestration` | `production` | `review`

- Orchestration may not produce content and may not accept work.
- Production may not edit another role's scope or place cross-role orders.
- Review judges against the spec owner's criteria, not its own taste.

## 7. Binding

- Bound conversation (role name → conversation): `cross-chat role bind <role-name> --to "<title>"`
- Created on: <date> · by human instruction: "<exact sentence>"
