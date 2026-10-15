# cross-chat CLI reference

The CLI ships with this skill. Commands are written as `cross-chat …`; run them through the bundled
launcher (see "Run the tool first" in `SKILL.md`), e.g.
`& "$env:USERPROFILE\.codely-cli\skills\cross-session-delivery\cross-chat.cmd" list`.

## Commands

```
cross-chat list                                   conversations + runtime state + bound roles  (P1)
cross-chat read   --to <role|id|title> [--n 6]     last messages of a conversation
cross-chat send   --to <role|id|title> --message "…" --wake wake [options]   deliver + receipt (P2/P3)
cross-chat active                                 which conversations are being driven now
cross-chat role bind <role> --to <role|id|title>  bind a stable role name (local, never committed)
cross-chat role list | role unbind <role>
cross-chat scheduled [--json]                     background deliveries and their outcomes
cross-chat version
```

Target resolution order: **role binding** → exact session id → unique id prefix → unique title.
An ambiguous target throws; it is never resolved at random.

## `send` options

| Option | Meaning |
| --- | --- |
| `--intent notice\|work` | `notice` = tell only (**default**), `work` = the peer must act |
| `--wake wake` | start a turn in the target now — pass this on every delivery |
| `--message-file <path>` | read the body from a UTF-8 file instead of `--message` — use it whenever the text contains `%` (a `.cmd` wrapper strips it) or other shell metacharacters |
| `--wait` | wait for the turn and read the reply back (default: deliver and return) |
| `--timeout <sec>` | bound for `--wait` (default 300) |
| `--wait-for-idle <sec>` | if the peer already has a turn in flight, wait up to this long for it to end before sending (default 60; 0 = send immediately) |
| `--retry <n>` / `--retry-delay <sec>` | attempts when the peer is still busy (default 3 / 5) |
| `--when-free` | if the peer is mid-turn, hand the delivery to a **background worker** that waits for that turn to end and then delivers (returns immediately; check with `cross-chat scheduled`) |
| `--from <role>` | sender role name, carried in the stamp — always pass it |
| `--ticket <id>` | work item id, carried in the stamp |
| `--live` / `--offline` | force a channel (default: hub when it answers, otherwise the CLI) |
| `--force` | bypass the "target is busy" guard (offline channel) |
| `--json` | machine readable result |
| `--debug` | diagnostics on stderr |

## Canonical message stamp

Every delivered body is prefixed with one machine-parseable line, so the receiver never infers intent
from prose:

```
[cross-chat intent=work wake=wake from=orchestrator ticket=T-7]
build the blockout
```

Parse it with `parseStamp(text)` (exported from `cross-chat/roles`). Fields omitted by the sender are
absent from the stamp; `intent` and `wake` are always present.

## Result shape

```json
{
  "ok": true,
  "receipt": "4ccae912-9a7a-406e-9738-1c6d445bbee6",
  "mode": "live",
  "intent": "work",
  "wake": "wake",
  "from": "orchestrator",
  "ticket": "T-1",
  "target": { "sessionId": "…", "title": "…", "workspace": "…", "addressedAs": "reviewer", "roles": ["reviewer"] },
  "waited": true,
  "reply": "CHECK=v24.21.0/5",
  "deliveredMessages": 3,
  "timedOut": false,
  "elapsedSec": 7,
  "error": null
}
```

- `ok` — **did the delivery succeed** (was a receipt obtained). It is not a verdict on the peer's work.
- `receipt` — the delivery proof: the stream message id for a waking delivery; a locally generated id for
  offline (that channel runs the turn synchronously).
- `waited` / `reply` — only meaningful with `--wait`. An empty `reply` with `waited: true` means the
  target did not produce text within the bound; it may still be running — check with `cross-chat read`
  rather than re-sending.
- `error` — set whenever `ok` is false, always actionable.

## Channels

| | **live** (default) | **offline** |
| --- | --- | --- |
| Call | `llm/streamChat` with `continueSessionId` | `codely --resume-session <id> -p …` |
| Starts a turn | yes | yes |
| Needs the client running | yes | no |
| Visible in an open tab | yes (message + streaming reply) | no (appears after reload) |
| Read the answer inline | `--wait` | always (runs synchronously) |
| Caveat | needs the desktop client (hub on `127.0.0.1:31415`) | refuses to deliver into a conversation owned by a live agent |

The offline channel **refuses** to deliver into a conversation owned by a live agent: the CLI would fork
into a *new* session and the message would never reach the target. The refusal is a feature — obey it.

## Environment

| Variable | Purpose |
| --- | --- |
| `CROSSCHAT_HUB` | hub base URL (default `http://127.0.0.1:31415`) |
| `CROSSCHAT_SESSIONS_ROOT` | session registry root (`~/.codely/sessions`) |
| `CROSSCHAT_TMP_ROOT` | transcript root (`~/.codely-cli/tmp`) |
| `CROSSCHAT_STATE_DIR` | local state: `roles.json`, `deliveries.jsonl`, collab plugin state |
| `CROSSCHAT_CLI` | explicit path to `codely(.exe)` for the offline channel |
| `CROSSCHAT_TIMEOUT_SEC` | default `--timeout` |
| `CROSSCHAT_LANG=zh` | Chinese CLI output (default English) |

The desktop client exports `CODELY_CLI=1` as a *boolean flag* — never interpret it as a path.

## Storage layout (read-only for the tool)

| What | Where |
| --- | --- |
| Session registry | `~/.codely/sessions/<workspace-guid>/sessions.sqlite` (`session_metadata`) |
| Transcripts (append-only JSONL) | `~/.codely-cli/tmp/<project-hash>/chats/<sessionId>.jsonl` |
| Ownership lock | `chats/.codely-conversation-<sha256(sessionId)>.owner.lock` — fresh mtime = a live agent owns it |
| Local role bindings | `<stateDir>/roles.json` — **never commit** (ids go stale) |
| Delivery ledger | `<stateDir>/deliveries.jsonl` — one JSON line per delivery (receipt, intent, wake, from, ticket) |

`<workspace-guid>` and `<project-hash>` are different identifiers; locate transcripts by session id, never
by converting between them.

## Programmatic use

```js
import { createCrossChat } from 'cross-chat';

const cc = createCrossChat();
cc.sessions();                                        // P1
cc.bindRole('builder', 'Level design chat');           // P4 / addressing
const r = await cc.send({ to: 'builder', message: 'build the blockout', intent: 'work', wake: 'wake' });
console.log(r.receipt, r.ok);
```

`send` throws on an unknown or ambiguous target, and returns `ok:false` (never throws) for transport
failures, so a caller can record the failure and fall back to the artifact.
