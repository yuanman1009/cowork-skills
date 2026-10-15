---
name: cross-session-delivery
description: Deliver a message, task, question or status report from the current agent conversation to another conversation of the same Codely / Tuanjie Cowork desktop client, with structured intent markers, immediate wake, role-name addressing and a delivery receipt. Use when work must be handed to, or an answer fetched from, another conversation/session/window on this machine - for example "send this to the other chat", "tell the art window", "hand this off to the builder", "ask the level-design session", "notify the reviewer", or when coordinating several parallel sessions without stepping on each other. Also use when reading another conversation's recent messages or checking which conversations are currently busy.
---

# Cross-session delivery

Move one message from **this** conversation to **another** conversation in the same desktop client, and
optionally read the answer back. The transport is the `cross-chat` CLI bundled with this skill; it talks to
the client's own local hub (protocol details: `docs/HUB-PROTOCOL.md`, next to this file).

The point of this skill is not "how to run a command" — it is the **delivery contract**: a message that
arrives is a *notification*, an artifact on disk is the *fact*, nothing may require an acknowledgement,
and **a delivery acts now or not at all**.

## Run the tool first (self-check)

The CLI ships with this skill: `bin/` + `src/` sit next to this file, and `cross-chat.cmd` (Windows) /
`cross-chat.sh` (macOS, Linux) is a launcher that **finds a Node runtime by itself** — `node` on `PATH`, or
the runtime the client ships. Nothing to install.

```powershell
$cc = "$env:USERPROFILE\.codely-cli\skills\cross-session-delivery\cross-chat.cmd"   # PowerShell
& $cc version        # self-check
```

- If the skill is installed elsewhere, the launcher is next to this `SKILL.md` (the client installs skills
  under `<home>/.codely-cli/skills/<name>/`).
- **If the self-check fails**, stop and tell the human what the launcher reported (no runtime found, or the
  client not installed). Do not guess paths or retry blindly.
- Every `cross-chat …` command below means `& $cc …`. A `cross-chat` already on `PATH` works too.

Needs the client to be **running** for live delivery; the offline channel works without it.

## How to deliver

A delivery always **wakes the target**: the peer conversation runs a turn for it right away, so what you
send is read in a turn rather than waiting for someone to notice it.

| Marker | Values | Meaning |
| --- | --- | --- |
| **intent** | `notice` / `work` | tell only vs. the peer must act |
| **wake** | `wake` | start a turn in the target conversation now |

```bash
# hand real work to a peer, and read its answer back in this turn
cross-chat send --to builder --message "build the level blockout" --intent work --wake wake --wait

# tell a peer something; it still wakes, so it is actually read
cross-chat send --to reviewer --message "hub icon v3 landed at assets/icons/hub-v3.png" \
  --intent notice --wake wake
```

If something is merely informational, prefer landing the artifact and pointing at it in one message over
sending anything at all.

**Bodies with special characters:** a `.cmd` wrapper cannot carry `%` verbatim (cmd.exe strips it, so
"progress 50%" would arrive corrupted). Write the body to a file and pass the path instead:

```powershell
# %% survives: the body is read from the file, not from the shell
cross-chat send --to builder --message-file "$env:TEMP\body.md" --intent work --wake wake
```

## The rules that matter

1. **Intent is never inferred from prose.** "please handle this" with `--intent notice` is a lost task.
   Set `--intent work` when you want action.
2. **A notice must not ask for a reply.** Do not append "please confirm"; the receipt is the confirmation.
3. **Name yourself, and make the name answerable.** The peer learns who sent a message only from the
   `from=` marker in the stamp, and it can answer only if that name resolves to a conversation. So:
   bind your own role name once (`cross-chat role bind <your-role> --to "<your conversation title>"`),
   then pass `--from <your-role>` (plus `--ticket <id>` when the work has one) on every delivery.
   `send` warns you when `--from` is missing or unbound — do not ignore that warning: the peer sees a name
   it cannot reply to. Observed: a peer that received a task with no sender could only ask "who sent this?"
   instead of doing the work.
4. **Success is the return value.** `send` prints a receipt. Do not verify delivery by opening the peer's
   conversation.
5. **Deliver, then stop.** Do not poll, sleep or re-send while waiting. Use `--wait` only when you need
   the answer in this turn, and bound it with `--timeout`.

### A peer with a turn in flight

A conversation runs one turn at a time. If the peer is mid-turn, the client may **hold the message and run
it after the current turn** (which is fine — it reaches the peer behind the running turn) or **refuse** it
with an explicit, transient error (`... currently controlled from another Codely view ...`).

Do not hand-roll retry loops for this. `send` handles it in two ways:

| Situation | What to pass | What happens |
| --- | --- | --- |
| The peer may be briefly busy | `--wait-for-idle 60 --retry 3` (defaults) | waits (event-driven) for the peer's turn to end, then delivers; bounded retries if still refused |
| The peer is running something long | `--when-free` | returns **immediately** and hands the message to a **background delivery** that waits for the peer's turn to end and then delivers |

`--when-free` is the one to use when you do not want to sit and wait: your turn ends and the message still
lands. Check it with `cross-chat scheduled` — it shows `waiting for the peer`, then `delivered` with a
receipt, or `failed` with the error.

**A scheduled delivery is not a delivery yet.** It has no receipt, so do not record it as delivered and do
not close the work item until the receipt appears.

Two more consequences:

- **Keep `--wait` off when the peer may be busy.** Waiting for a long turn is what makes a busy peer look
  like a failure, and it holds your own turn open for no reason.
- If the delivery still fails after the bounded attempts, report it plainly and record the intent on the
  board — do not hammer the peer, and never bypass the refusal with a forced offline channel (that forks
  into a new conversation and loses the message without a trace).

### Deliver behaviour, not promises

**A delivery cannot buy a future behaviour.** Observed failure: a delivered instruction of the form "when
the human next messages you, also output X" was read, understood and explicitly planned by the peer ("on
next human message, output X once") — and then ignored, because that conversation's agent **instance was
handed off** before the human's message arrived. The new instance answered the human normally; nobody was
tracking the pending promise. The delivery receipt had said `ok: true`, because the delivery *had*
succeeded.

Rules that follow from it:

- **Ask for the behaviour in the turn the message creates** ("now, output X", "reply with the hash") —
  that is reliable and observable.
- Anything that must fire *later* or *on a condition* belongs in a place that is re-read every turn
  (a file the role reads at entry, project memory, a board row) — **or** it must be driven by an event
  (e.g. a watcher on the peer's message stream that delivers a message when the condition is met).
- Never treat "the peer acknowledged / promised" as state. Promises live in a context that can be
  replaced at any moment.

## Addressing: role names, never session ids

```bash
cross-chat role bind builder --to "Level design chat"    # local file, never committed
cross-chat send --to builder --message "…" --intent work --wake wake
```

- Address by **role name** (a stable logical name bound to whichever conversation holds that duty).
- **Never write session ids into documents, boards, charters or skills.** Ids expire and turn into ghost
  targets whose deliveries look successful while nobody receives them.
- `--to` also accepts a session id, a unique id prefix or a unique title, and **fails loudly on
  ambiguity** — never pick one of two same-named conversations yourself.

## Reading another conversation

```bash
cross-chat list                 # conversations + runtime state (running/idle) + bound roles   (P1)
cross-chat read --to builder --n 6
cross-chat active               # which conversations are being driven right now
```

Use `list` **before** delivering when you are unsure the target still exists: an ended target means the
delivery is thrown away even though it looked successful.

## Outcome shape

```json
{ "ok": true, "receipt": "4ccae912-…", "mode": "live", "intent": "work", "wake": "wake",
  "target": { "sessionId": "…", "title": "…", "addressedAs": "reviewer", "roles": ["reviewer"] },
  "waited": true, "reply": "…", "timedOut": false, "error": null }
```

`receipt` is the delivery proof (the stream message id). Record it; never ask the peer to acknowledge.
An empty `reply` with `waited: true` means no text arrived within the bound — the target may still be
running; check with `cross-chat read` rather than re-sending.

## Reporting a failure honestly

- `ok: false` with a hub error ⇒ say so and fall back to the artifact; do not retry without saying so.
- The offline channel (no client running) **refuses** to deliver into a conversation owned by a live
  agent, because the CLI would fork into a new session. Respect that refusal — it prevents a duplicated
  delivery.
- Notice you were wrong after delivering ⇒ deliver a correction ("previous message void / corrected to
  X"); never quietly edit the artifact pretending it never happened.

## References

- `references/delivery-contract.md` — the transport-level contract: the four primitives, the four hard
  requirements, addressing discipline, concurrency behaviour and turn discipline.
- `references/cross-chat-cli.md` — every command, flag, environment variable, output field and failure
  mode of the tool, plus the canonical message stamp and the desktop-client storage layout.
- `docs/HUB-PROTOCOL.md` — the client's local API (reverse engineered, measured), for when you need to go
  below the CLI.
