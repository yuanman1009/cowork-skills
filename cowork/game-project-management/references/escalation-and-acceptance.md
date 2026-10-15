# Escalation and acceptance

## 1. When to ask the human

Ask whenever a choice would **materially change** any of these and the current rule source gives no
unique answer:

look and feel / user experience · gameplay or business behaviour · direction and style · delivery scope ·
cost · **the fate of existing artifacts**

**Procedure**

| Step | Action |
| --- | --- |
| 1 | **land a pending-decision artifact**: options / consequences / recommendation |
| 2 | **while waiting: no specs, no production** |
| 3 | execute only after the human names an option or explicitly authorizes; **a blanket authorization must state its scope** |

**Phrases that may not be used to skip it**: "this doesn't block other work" · "it's in scope" · "build it
and see" · "autonomy was already granted".
**Does not apply** when: the rule source already gives a unique answer · purely internal, reversible
implementation details · mechanical execution inside an established acceptance scope.

## 2. Four pre-checks before asking

| # | Question | Cost of skipping |
| --- | --- | --- |
| 1 | **Is it already done?** — read the **whole** status cell, do not pattern-match "todo/pending" (cells are often "state + how far along") | politely asking about finished work |
| 2 | **Can I answer it myself?** — do the rule source / ledger / an effective ruling give a unique answer | asking something already answered |
| 3 | **Is it one thing?** — one question at a time; merge questions whose answers must move together | splitting one thing into two, wasting a human round |
| 4 | **Was it answered elsewhere?** | re-asking |

## 3. Three hard requirements on the question text

| Requirement | Counter-example | Good example |
| --- | --- | --- |
| **No codes, ids or file locations** — describe the thing itself | "shall we proceed with item A-12?" | "how many rooms per dungeon run?" |
| **Options carry their own meaning** — never "option A / option B" | "A or B?" | "**1 room only** / **2 rooms (staging + boss)**" |
| **Give a one-line recommendation with its reason, but do not decide** | a bare list | "I suggest 2 rooms, because the boss needs a buffer" |

*Observed*: a round was wasted because the question used codes and internal jargon — the human could not
read it and it had to be asked again.

## 4. Delivery and acceptance

**Delivered** = producer lands the artifact + delivers one notice. No confirmation hop exists.

**Three lines of defence instead of manual acceptance**

| Line | Who | Note |
| --- | --- | --- |
| ① automated gate | the producer runs it | the orchestrator does not re-run it as a separate seat |
| ② downstream consumer | whoever uses it checks it | cross-party inconsistency surfaces at consumption; responsibility sits with the consumer |
| ③ the human's face | for criteria that are theirs | the orchestrator **relays**; relaying is routing, not acceptance |

**Record semantics**: *"X self-reports completion (date · artifact path · commit)"*.
**Forbidden words**: passed / accepted / verified — unless that judgement belongs to your role.

**Delivery and closure are separate**: a delivery ends the producer's turn; it does not close the
human-acceptance item of a feature. Update the board's "delivery evidence" and "not human-checked" states
before delivering, and never remove a human-check tag on someone's behalf.

**Defects**: implementation defects go back to whoever produced the implementation; rule problems go back
to the spec owner. **The orchestrator does not bounce deliveries** — it records as-is, notes the doubt and
reports to the human.

## 5. Human checks vs. automation

| Rule | Meaning |
| --- | --- |
| Human-check gate | user-operable features are handed to a human in stage batches; one check may cover several deliveries of the same version, updating only what was explicitly checked |
| No conclusion = not checked | automated tests, commits and receipts do **not** substitute for experience checks |
| Pass to close | failing means rework; a new version affecting the feature is checked again |
| Supporting deliveries | docs and tooling with no independent user entry point close on **technical evidence**, without demanding item-by-item operation — and without pretending they passed |
| Evidence recorded | the human's conclusion, date, actual checked scope, version and where it can be checked. **Approving a start or a plan ≠ the product passing** |
| Aesthetics belong to the human | pretty / does it look like the reference / can you read it ⇒ the human. Technical image verification (blank rows, centring offset, pixel alignment, colour values, sizes) is **allowed** by anyone: what is forbidden is "it looks good" by feel |

## 6. Self-consistency of a claim

When someone offers "this recomputation matches the spec digit for digit" as proof, ask first: **internal
or external consistency?**

- internal: the numbers lock together inside their own system
- external: substituting the value into the system's other quantities still makes sense

An internally consistent recomputation alone **cannot** support a ruling on a reference value; that needs
one external cross-check. Criterion sentence: *"If I take this value, what do three existing dimensions
become?"*
