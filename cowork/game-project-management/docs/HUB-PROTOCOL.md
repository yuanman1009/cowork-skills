# Hub protocol (reverse engineered, verified)

Everything here was derived from the shipped desktop client (Tuanjie Cowork / Codely Desktop,
app `2.1.4-canary.5`, CLI `1.0.0-release.67–68`) and confirmed by live experiments.
It is an **internal API**: no vendor contract, no stability promise. `cross-chat` isolates it in
`src/hub.js` so a client update only affects that file.

## 1. Transport

The desktop shell (`cowork.exe`, a Tauri app) serves the UI *and* routes messages between the webviews
and the agent sessions. It listens on loopback only:

```
http://127.0.0.1:31415
```

Two endpoints matter:

| Endpoint | Direction | Purpose |
| --- | --- | --- |
| `POST /api/tauri/invoke` | UI → shell | send one message envelope, get a JSON answer (or `null` when deferred) |
| `GET /api/tauri/events` | shell → UI | server-sent events: everything the shell pushes back |

### Request envelope

```json
POST /api/tauri/invoke
Content-Type: application/json
X-Workspace-Dir: C%3A%5CUsers%5Cme%5Cproject      <-- encodeURIComponent(workspace path)

{
  "messageType": "acp/getVersion",
  "messageId": "<uuid, optional>",
  "data": { },
  "workspaceDir": "C:\\Users\\me\\project"
}
```

**Routing is mandatory.** A call without the workspace routing pair
(`X-Workspace-Dir` header *and* `workspaceDir` in the body) is answered with **HTTP 400**.
This is the single most common reason a hand-written call "does nothing".

Response shape on success:

```json
{ "data": { "content": { }, "status": "success" }, "messageId": "", "messageType": "acp/getVersion" }
```

Errors are reported in-band, not as HTTP failures:

```json
{ "data": { "error": "Unhandled message type: foo/bar", "status": "error" }, "messageType": "foo/bar" }
```

Long-running calls (streaming) answer `null` / a partial envelope and continue over SSE.

### Event envelope (SSE)

```
GET /api/tauri/events            (optionally ?window=<label>&workspaceDir=<path>)
```

```
data: {"hubWorkspaceKey":"local:C%3A%5CUsers%5Cme%5Cproject",
       "inner":{"messageId":"<stream or request id>","messageType":"llm/streamChat",
                "data":{ ... },"workspaceId":"c15aa34c-…"},
       "workspaceRef":{"runOn":"local","workspaceDir":"C:\\Users\\me\\project"}}
```

Events are pushed to every connected client, so an external subscriber sees the traffic of all
conversations in that workspace. `data.streamMessageId` correlates a stream with the `messageId`
that started it.

## 2. Message types used by `cross-chat`

| messageType | Direction | Verified behaviour |
| --- | --- | --- |
| `acp/getVersion` | request | liveness probe; returns `{content:{version:null},status:"success"}` |
| `llm/streamChat` | request | **the prompt channel**: runs a turn in the session given by `continueSessionId` |
| `stream/getActiveStreams` | request | returns `{content:{activeStreams:[{sessionId, streamMessageId, accumulatedContent, conversationHistory…}]}}`; the payload contains full live context, treat it as potentially large |
| `acp/enqueueSessionMessage` | request | pushes a user message into the session message queue (`{enqueued:true,injected:true}`) |
| `acp/withdrawLastUserPrompt` | request | withdraws the last user prompt |
| `acp/initSession` | request | starts the Codely CLI ACP session for a workspace |
| `stream/userMessageBroadcast` | push | a user message was accepted for a session (the UI renders it) |
| `stream/liveUpdate` | push | streaming content update (deltas), consumed by every window of that session |
| `stream/streamFinished` / `stream/streamError` | push | end of a stream (`error` may be `null` on the normal path) |
| `acp/toolCallStateUpdate`, `acp/contextUsageUpdate`, `acp/agentStatusUpdate`, `acp/jobUpdated`, … | push | session state telemetry |
| `acp/requestPermission`, `acp/requestShellConfirmation` | push→reply | the core asks the GUI for approval (used by the UI, not needed here) |
| `history/load`, `history/save`, `history/list`, `history/fork`, `history/rewind`, `history/markAsUnread`, … | request | conversation history management |

The shell recognises a large table of types (`tauri/*`, `ide/*`, `unity/*`, `tjhub/*`, `skills/*`,
`extensions/*`, `lsp/*`, `terminal/*`, `process/*`, `controlPlane/*`, …). Unknown types return
`Unhandled message type: <type>`, which makes probing safe and self-documenting.

## 3. Delivering a task to another conversation (the live channel)

This is exactly what the desktop UI does when you press Enter in a conversation:

```json
{
  "messageType": "llm/streamChat",
  "messageId": "<uuid>",
  "data": {
    "collaborationMode": "default",
    "approvalMode": "yolo",
    "continueSessionId": "<target session id>",
    "completionOptions": { "model": "deepseek-flash" },
    "title": "deepseek-flash",
    "modelDescription": { "title": "deepseek-flash", "model": "deepseek-flash" },
    "messages": [ { "role": "user", "content": "…" } ],
    "messageOptions": {}
  },
  "workspaceDir": "C:\\Users\\me\\project"
}
```

Verified effects (all reproduced live):

1. the target conversation's **live agent session** runs the turn, with its own model, approval mode and tools;
2. the shell broadcasts `stream/userMessageBroadcast` + `stream/liveUpdate`, so **every window showing that
   conversation renders the message and the streaming reply** in real time;
3. the turn is **persisted** as `user` + `gemini` records in that conversation's transcript;
4. `stream/streamFinished` closes the stream (match on `data.streamMessageId === messageId`).

`approvalMode` values seen on real sessions: `yolo`, `auto_edit`, `default`. Passing the target
conversation's own stored value keeps its behaviour consistent.

### What does *not* start a task

`acp/enqueueSessionMessage` with `{sessionId, message, inject:true}` (the call the UI uses to inject a
message into a *running* round) answers `{"enqueued":true,"injected":true}` and even spawns the target
session's agent — but an **idle** conversation does not start generating from it.
Use `llm/streamChat` when the goal is "make that conversation do something".

### One turn at a time: the busy refusal

A conversation can only be driven by one turn at a time. When the target already has a turn in flight,
the hub answers a new `llm/streamChat` with an in-band error instead of accepting it:

```json
{"data":{"status":"error","error":"This session is currently controlled from another Codely view (stream <id>)"}}
```

Facts worth knowing (all measured):

- **`stream/getActiveStreams` is the authority** for "has a turn in flight": it lists the sessions with a
  live stream. A conversation whose agent *process* is alive but idle does not appear, and is safe to
  deliver to — do not infer "busy" from process state.
- The refusal is **transient and explicit**, so it is retryable: wait for that session's
  `stream/streamFinished` push (event-driven, no polling), then send again.
- A user message that arrives mid-turn is sometimes **queued by the client** instead of refused (measured:
  two consecutive deliveries to a conversation that was running both landed, the second behind the first).
  Both outcomes reach the peer, so a delivery attempt is never wasted — but only the accepted case returns
  immediately.
- `cross-chat` implements exactly this: it waits up to `--wait-for-idle <sec>` (default 60) for the peer's
  turn to end, and retries `--retry <n>` times (default 3, `--retry-delay <sec>`, default 5) if it is still
  refused. The result reports `attempts` and `waitedForIdleSec`.
- **For a peer that stays busy for a long time**, waiting inline would hold the sending conversation open —
  which the delivery contract forbids. `--when-free` writes the intended delivery to
  `<stateDir>/scheduled/<jobId>.json`, starts a detached worker (`cross-chat deliver-job <jobId>`) and
  returns immediately. The worker waits for that session's `stream/streamFinished` and then delivers,
  writing `<jobId>.result.json` (`ok`, `receipt`, `attempts`, `error`, `waitedSec`) plus the usual ledger
  line; `cross-chat scheduled` lists the jobs and their outcomes. A scheduled delivery has **no receipt
  yet**, so it must never be reported as delivered.

## 4. Conversation storage on disk

| What | Where |
| --- | --- |
| Session registry | `~/.codely/sessions/<workspace-guid>/sessions.sqlite`, table `session_metadata` |
| Transcript | `~/.codely-cli/tmp/<project-hash>/chats/<sessionId>.jsonl` (append-only) |
| Checkpoint / resumable snapshot | `~/.codely-cli/tmp/<project-hash>/chat-<sessionId>.json` |
| Ownership lock | `chats/.codely-conversation-<sha256(sessionId)>.owner.lock` (empty **directory**, mtime = heartbeat) |

> `<workspace-guid>` (e.g. `0f3a91c2-…`) and `<project-hash>` (e.g. `9d4e77ab…`) are **different
> identifiers**. Do not try to convert between them: locate transcripts by session id.

Transcript records:

```json
{"t":"header","v":1,"seq":0,"durableSessionId":"<session id>","projectHash":"…"}
{"t":"put","seq":18,"msg":{"id":"…","type":"user","content":[{"text":"…"}]}}
{"t":"put","seq":19,"msg":{"id":"…","type":"gemini","content":"…","model":"deepseek-flash"}}
{"t":"ckpt","seq":21,"msgCount":9,"title":"…","toolsHash":"…","contextTokens":1234}
{"t":"session","seq":20,"patch":{ … }}
{"t":"handoff","seq":17,"instanceId":"…","prevInstanceId":"…"}
```

Assistant messages use `type: "gemini"`. `t:"ckpt"` carries the conversation title, which is handy when
the registry is unavailable.

## 5. The offline channel (CLI)

```
codely --resume-session <sessionId> [--approval-mode yolo|auto_edit|default] -p "<message>" --output-format text
```

Verified:

- it loads the conversation from the **shared store** (`resumed session …/chats/<sessionId>.jsonl, turns=N`)
  and **appends the new turn to the same file** (observed 95,653 → 98,001 bytes);
- when the conversation is **owned by a live agent**, the CLI does **not** take it over: it forks into a
  *new* session (`chats/<new-uuid>.jsonl`) and the original conversation never receives the message;
- `--resume-path <snapshot.json>` always forks, so it cannot be used to deliver into an existing conversation.

A headless CLI run may print `Budget has been exceeded` for internal helper calls (e.g. the
"next speaker" check) while still producing the main answer — judge success by the transcript, not stderr.

## 6. Probing safely

Unknown types are rejected without side effects, which makes the API easy to explore:

```bash
curl -s -X POST http://127.0.0.1:31415/api/tauri/invoke \
  -H 'Content-Type: application/json' \
  -H 'X-Workspace-Dir: <encoded path>' \
  -d '{"messageType":"acp/getVersion","data":{},"workspaceDir":"<path>"}'
```

```json
{"data":{"content":{"version":null},"status":"success"},"messageType":"acp/getVersion"}
```

Remember: **no routing header → HTTP 400**, and only loopback clients are accepted
(`uos/getAppCredentials is only available to local clients`).
