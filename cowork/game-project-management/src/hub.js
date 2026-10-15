/**
 * Hub client -- the desktop client's own local HTTP API.
 *
 * Base URL: http://127.0.0.1:31415  (the Codely Desktop shell)
 * Every request is a POST to /api/tauri/invoke with a message envelope:
 *
 *     { "messageType": "...", "messageId": "<uuid>", "data": { ... }, "workspaceDir": "..." }
 *
 * Two rules that the real hub enforces:
 *   1. Requests must be routed to a workspace: send the `X-Workspace-Dir` header
 *      (encodeURIComponent of the workspace path) *and* `workspaceDir` in the body.
 *      Without it the hub answers HTTP 400.
 *   2. `messageId` is optional for short calls and required (and echoed back) for streaming calls.
 *
 * Long running calls answer `null` (or a partial envelope) synchronously and keep streaming over
 * GET /api/tauri/events (server-sent events) keyed by `messageId` / `streamMessageId`.
 *
 * See docs/HUB-PROTOCOL.md for the full reverse engineered catalogue.
 */
import http from 'node:http';

export const DEFAULT_HUB_URL = 'http://127.0.0.1:31415';

/**
 * Pure request builder -- kept separate so the wire shape is unit-testable.
 * @returns {{url: string, headers: Record<string,string>, body: object}}
 */
export function buildInvokeRequest({ hubUrl = DEFAULT_HUB_URL, messageType, data, messageId, workspaceDir }) {
  if (!messageType) throw new Error('messageType is required');
  const url = new URL('/api/tauri/invoke', hubUrl).toString();
  const headers = { 'Content-Type': 'application/json' };
  if (workspaceDir) headers['X-Workspace-Dir'] = encodeURIComponent(workspaceDir);
  const body = {
    messageType,
    ...(messageId ? { messageId } : {}),
    data: data ?? {},
    ...(workspaceDir ? { workspaceDir } : {}),
  };
  return { url, headers, body };
}

/** Split a raw SSE chunk buffer into complete events, returning the leftover tail. */
export function parseSseEvents(buffer) {
  const events = [];
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? '';
  for (const line of lines) {
    const idx = line.indexOf('data: ');
    if (idx === -1) continue;
    try { events.push(JSON.parse(line.slice(idx + 6))); } catch { /* ignore keep-alives */ }
  }
  return { events, rest };
}

export class HubClient {
  constructor({ baseUrl = DEFAULT_HUB_URL, workspaceDir, timeoutMs = 30_000 }) {
    this.baseUrl = baseUrl;
    this.workspaceDir = workspaceDir;
    this.timeoutMs = timeoutMs;
  }

  /** POST one message envelope. Resolves { status, json, text }. */
  invoke(messageType, data, { messageId, workspaceDir = this.workspaceDir, timeoutMs = this.timeoutMs } = {}) {
    const req = buildInvokeRequest({ hubUrl: this.baseUrl, messageType, data, messageId, workspaceDir });
    const payload = Buffer.from(JSON.stringify(req.body));
    return new Promise((resolve, reject) => {
      const url = new URL(req.url);
      const request = http.request({
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: { ...req.headers, 'Content-Length': payload.length },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch { /* may be null for deferred responses */ }
          resolve({ status: res.statusCode, json, text });
        });
      });
      request.on('error', reject);
      request.setTimeout(timeoutMs, () => request.destroy(new Error('hub request timed out')));
      request.write(payload);
      request.end();
    });
  }

  /** Cheap liveness probe (also validates that workspace routing works). */
  async getVersion() {
    const res = await this.invoke('acp/getVersion', {}, { timeoutMs: 8000 });
    if (res.status !== 200) throw new Error(`hub answered HTTP ${res.status}`);
    return res.json?.data?.content ?? null;
  }

  async isAlive() {
    try { await this.getVersion(); return true; } catch { return false; }
  }

  async activeStreams() {
    const res = await this.invoke('stream/getActiveStreams', {}, { timeoutMs: 20_000 });
    return res.json?.data?.content?.activeStreams ?? [];
  }

  /**
   * Send a user message into an existing conversation and let its agent run.
   * This is the same call the desktop UI makes; the hub broadcasts the turn to every window,
   * so an open tab of that conversation shows the message and the streaming reply.
   */
  sendUserMessage({
    sessionId, text, messageId, modelTitle, approvalMode, collaborationMode,
    messageOptions, timeoutMs = 60_000,
  }) {
    const data = {
      collaborationMode: collaborationMode || 'default',
      approvalMode: approvalMode || 'yolo',
      continueSessionId: sessionId,
      completionOptions: modelTitle ? { model: modelTitle } : {},
      ...(modelTitle ? { title: modelTitle, modelDescription: { title: modelTitle, model: modelTitle } } : {}),
      messages: [{ role: 'user', content: String(text) }],
      messageOptions: messageOptions ?? {},
    };
    return this.invoke('llm/streamChat', data, { messageId, timeoutMs });
  }

  /**
   * Silent inbox delivery: enqueue a message for a conversation **without starting a turn**
   * (`inject:false`). Verified behaviour: the hub answers `{enqueued:true, queueItemId:"<uuid>"}`
   * and the target executes nothing until it runs on its own.
   * Use this for `wake=queue` notices so a mere status report never burns a turn of the target's budget.
   */
  async enqueueUserMessage({ sessionId, text, timeoutMs = 30_000 }) {
    const res = await this.invoke('acp/enqueueSessionMessage',
      { sessionId, message: String(text), inject: false }, { timeoutMs });
    const content = res.json?.data?.content;
    const error = res.json?.data?.error;
    return {
      status: res.status,
      ok: res.status === 200 && !error && content?.enqueued === true,
      queueItemId: content?.queueItemId ?? null,
      error: error ?? (content?.enqueued ? null : `unexpected answer: ${String(res.text).slice(0, 200)}`),
    };
  }

  /**
   * Subscribe to the hub event stream (server sent events).
   * Returns { stop, done } -- `done` resolves when the stream ends or errors.
   * Event-driven: the hub pushes, there is no polling.
   */
  openEventStream({ onEvent, path: streamPath = '/api/tauri/events' } = {}) {
    const url = new URL(streamPath, this.baseUrl);
    let settled = false;
    let resolveDone;
    const done = new Promise((r) => { resolveDone = r; });
    let buffer = '';
    const request = http.request({
      method: 'GET',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { Accept: 'text/event-stream' },
    }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        const { events, rest } = parseSseEvents(buffer);
        buffer = rest;
        for (const ev of events) { try { onEvent?.(ev); } catch { /* listener errors must not kill the stream */ } }
      });
      res.on('end', () => { if (!settled) { settled = true; resolveDone({ ended: true }); } });
    });
    request.on('error', (err) => { if (!settled) { settled = true; resolveDone({ ended: true, error: err.message }); } });
    request.end();
    return { done, stop: () => { try { request.destroy(); } catch { /* ignore */ } } };
  }

  /**
   * Wait until one specific stream finishes.
   *
   * Primary signal: the hub's `stream/streamFinished` / `stream/streamError` event (push, no polling).
   * Fallback: `isQuiet()` probing, for environments where that event is not observed.
   */
  async waitForStreamEnd({ streamMessageId, timeoutSec = 300, isQuiet, quietMs = 6000, pollMs = 2000 }) {
    if (!streamMessageId) throw new Error('streamMessageId is required');

    let finished = false;
    let resolveFinish;
    const finish = new Promise((resolve) => { resolveFinish = resolve; });
    const settle = (result) => { if (!finished) { finished = true; resolveFinish(result); } };

    const stream = this.openEventStream({
      onEvent: (envelope) => {
        const inner = envelope?.inner ?? {};
        const data = inner.data ?? {};
        if (data.streamMessageId !== streamMessageId) return;
        if (inner.messageType === 'stream/streamFinished') settle({ finished: true });
        else if (inner.messageType === 'stream/streamError') settle({ finished: true, error: data.error ?? null });
      },
    });

    let watcher = null;
    const timer = setTimeout(() => settle({ finished: false, timeout: true }), timeoutSec * 1000);

    if (typeof isQuiet === 'function') {
      let previous = -1;
      let unchangedSince = Date.now();
      watcher = setInterval(() => {
        const now = isQuiet();
        if (now !== previous) { previous = now; unchangedSince = Date.now(); return; }
        if (now > 0 && Date.now() - unchangedSince > quietMs) settle({ finished: true, quiet: true });
      }, pollMs);
    }

    try {
      return await finish;
    } finally {
      clearTimeout(timer);
      if (watcher) clearInterval(watcher);
      stream.stop();
    }
  }
}
