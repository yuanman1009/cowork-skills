/**
 * Delivery engine -- the concrete implementation of the delivery primitives (P1-P4).
 *
 * Channels
 * --------
 *   queue   P2 with `wake=queue`: silent inbox. Enqueues the stamped message into the target
 *           conversation **without starting a turn**. The hub returns a `queueItemId`, which becomes
 *           the delivery receipt. Use this for notices and status reports: a report must never burn a
 *           turn of the target's budget. Requires the desktop client (hub).
 *
 *   live    P2 with `wake=wake`: starts a turn in the target conversation through the client's own
 *           streaming call. The turn is broadcast to every window (an open tab shows the message and
 *           the reply live) and persisted. Optionally awaits the answer (`wait:true`).
 *
 *   offline fallback when the hub is unavailable: `codely --resume-session <id> -p "…"`.
 *           Only appends to the target conversation when it is not owned by a live agent; otherwise
 *           the CLI forks into a new session (detected and reported, never reported as success).
 *
 * Contract
 * --------
 *   - Delivery is completion: a returned receipt means "the target got it". There is no second
 *     confirmation step and callers must not ask the peer to acknowledge.
 *   - Success is judged by the **return value** (the receipt), never by peeking at the target's inbox.
 *   - Fail-safe defaults: `intent=notice`, `wake=queue`, `wait=false`. A forgotten flag costs a little
 *     latency, never a budget.
 *   - `wait` is opt-in and bounded. Never poll, never sleep waiting for a peer.
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HubClient } from './hub.js';
import { createJob, spawnWorker } from './schedule.js';
import { DEFAULT_INTENT, DEFAULT_WAKE, assertIntent, assertWake, stampMessage } from './roles.js';
import { messageCount, newAssistantText, readRecords } from './store.js';

/** The client's refusal when the target conversation already has a turn in flight. */
export const BUSY_TARGET_RE = /controlled from another Codely view/i;

export class Deliverer {
  /**
   * @param {object} deps
   * @param {import('./store.js').SessionStore} deps.store
   * @param {object} deps.config
   * @param {object} [deps.logger]
   * @param {object} [deps.registry] collab registry (optional hooks)
   * @param {(workspaceDir: string) => HubClient} [deps.hubFactory]
   * @param {import('./roles.js').RoleRegistry} [deps.roles]
   * @param {Function} [deps.spawn] injectable process runner (tests)
   */
  constructor({ store, config, logger, registry, hubFactory, spawn, roles }) {
    this.store = store;
    this.config = config;
    this.logger = logger ?? { info() {}, warn() {}, error() {}, debug() {} };
    this.registry = registry;
    this.roles = roles ?? null;
    this.hubFactory = hubFactory ?? ((workspaceDir) => new HubClient({ baseUrl: config.hubUrl, workspaceDir }));
    /** Injectable for tests: (command, args, cwd, timeoutSec) => { code, stdout, stderr, timeout } */
    this.spawnProcess = spawn ?? runProcess;
  }

  /** Is the desktop client reachable for this workspace? */
  async hubAlive(workspaceDir) {
    try { return await this.hubFactory(workspaceDir).isAlive(); } catch { return false; }
  }

  /** P1 -- conversations with their runtime state (sync: reads only local stores). */
  sessions() {
    return this.store.list().map((session) => {
      const lock = this.store.ownerLock(session);
      return {
        sessionId: session.sessionId,
        title: session.title,
        workspace: session.workspaceDirectory,
        roles: this.roles?.rolesOf(session.sessionId) ?? [],
        runtime: lock.held && lock.fresh ? 'running' : 'idle',
        heartbeatAgeSec: lock.ageMs == null ? null : Math.round(lock.ageMs / 1000),
      };
    });
  }

  /** P4 -- resolve a target: role name first, then session id / prefix / unique title. */
  resolveTarget(to) {
    const bound = this.roles?.resolveRole(to);
    if (bound) {
      // A stale binding must fail loudly: address by role name, never deliver into a ghost session.
      return { ...this.store.resolve(bound), addressedAs: to, boundRole: true };
    }
    return { ...this.store.resolve(to), addressedAs: to, boundRole: false };
  }

  /**
   * Deliver `message` to the conversation identified by `to`.
   *
   * @param {object} params
   * @param {string} params.to            role name, session id / prefix, or unique title
   * @param {string} params.message       body to deliver (the stamp is added automatically)
   * @param {'notice'|'work'} [params.intent='notice']  tell-only vs. asking the peer to act
   * @param {'queue'|'wake'} [params.wake='queue']       inbox-only vs. start a turn now
   * @param {string} [params.from]        sender role name (goes into the stamp)
   * @param {string} [params.ticket]      work item id (goes into the stamp)
   * @param {'auto'|'live'|'offline'} [params.mode='auto']
   * @param {boolean} [params.wait=false] wait for the turn to finish and read the reply back
   * @param {number} [params.timeoutSec]
   * @param {boolean} [params.force=false] bypass the "target is busy" guard (offline channel)
   * @param {number} [params.idleWaitSec] wait this long for a peer's in-flight turn to end (0 = none)
   * @param {number} [params.retries]     attempts when the peer is still busy
   * @param {number} [params.retryDelaySec] pause between those attempts
   * @param {boolean} [params.whenFree]   if the peer is mid-turn, hand the delivery to a background
   *                                      worker (returns immediately) instead of waiting inline
   * @param {boolean} [params.stamped]    internal: `message` already carries its stamp (job replay)
   */
  async deliver({
    to, message, intent = DEFAULT_INTENT, wake = DEFAULT_WAKE, from, ticket,
    mode = 'auto', wait = false, timeoutSec, force = false,
    idleWaitSec, retries, retryDelaySec, whenFree = false, stamped = false,
  }) {
    if (!message || !String(message).trim()) throw new Error('message is required');
    assertIntent(intent);
    assertWake(wake);
    // Numbers coming from config, CLI flags or a scheduled job can be NaN/garbage; a bad retry count
    // must never silently turn into "no attempt at all" (which would report success without sending).
    const num = (value, fallback) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    const busyPolicy = {
      idleWaitSec: num(idleWaitSec ?? this.config.idleWaitSec, 0),
      retries: Math.max(1, Math.floor(num(retries ?? this.config.retries, 1))),
      retryDelaySec: num(retryDelaySec ?? this.config.retryDelaySec, 0),
    };

    const target = this.resolveTarget(to);
    const markers = { intent, wake, from, ticket };
    const body = stamped ? String(message) : stampMessage(String(message), markers);
    const budget = timeoutSec ?? this.config.defaultTimeoutSec;

    // The peer only learns who sent this from the `from=` marker, and it can answer only if that name
    // resolves to a conversation locally. Both failures are silent otherwise — say something.
    const warnings = [];
    if (this.roles) {
      const bound = from ? this.roles.resolveRole(from) : null;
      if (!from) {
        warnings.push('no --from given: the peer sees no sender, so it cannot answer you');
      } else if (!bound) {
        warnings.push(`"--from ${from}" is not bound to a conversation, so the peer sees the name but cannot `
          + `answer it; bind it first: cross-chat role bind ${from} --to "<your conversation title>"`);
      }
    }

    const prepared = stamped
      ? { message: body }
      : (await this.#runHook('beforeDeliver', { target, message: body, mode, ...markers }) ?? { message: body });

    const startedAt = Date.now();
    let raw;
    if (wake === 'queue') {
      raw = await this.#enqueue(target, prepared.message, budget);
    } else {
      const channel = mode === 'auto'
        ? ((await this.hubAlive(target.workspaceDirectory)) ? 'live' : 'offline')
        : mode;
      const hub = channel === 'live' ? this.hubFactory(target.workspaceDirectory) : null;
      const peerBusy = hub ? await this.#targetStreaming(hub, target.sessionId) : false;

      if (channel === 'live' && whenFree && peerBusy && !wait) {
        // Do not hold this turn open for a peer that is busy: hand it to a background worker that
        // waits (event-driven) for the peer's turn to end and then delivers exactly this body.
        const job = createJob(this.config, {
          to: target.sessionId, message: prepared.message, stamped: true,
          intent, wake, from, ticket, mode: 'live', wait: false,
        });
        const pid = spawnWorker({ config: this.config, jobId: job.jobId });
        raw = {
          mode: 'live',
          ok: true,
          scheduled: true,
          jobId: job.jobId,
          workerPid: pid,
          receipt: null,           // not delivered yet: a scheduled delivery has no proof
          waited: false,
          reply: '',
          note: `peer has a turn in flight; a background delivery (job ${job.jobId}) will deliver when that turn ends`,
        };
      } else {
        raw = channel === 'live'
          ? await this.#wakeLive(target, prepared.message, budget, { wait, meta: prepared.meta, busyPolicy })
          : await this.#sendOffline(target, prepared.message, budget, { force });
      }
    }

    const result = {
      ok: !!raw.ok,
      receipt: raw.receipt ?? null,
      mode: raw.mode,
      intent,
      wake,
      ...(from ? { from } : {}),
      ...(ticket ? { ticket } : {}),
      target: {
        sessionId: target.sessionId,
        title: target.title,
        workspace: target.workspaceDirectory,
        addressedAs: target.addressedAs,
        roles: this.roles?.rolesOf(target.sessionId) ?? [],
      },
      waited: !!raw.waited,
      reply: raw.reply ?? '',
      deliveredMessages: raw.deliveredMessages ?? 0,
      timedOut: !!raw.timedOut,
      attempts: raw.attempts ?? 1,
      waitedForIdleSec: raw.waitedForIdleSec ?? 0,
      ...(raw.scheduled ? { scheduled: true, jobId: raw.jobId ?? null } : {}),
      ...(warnings.length ? { warnings } : {}),
      elapsedSec: raw.elapsedSec ?? Math.round((Date.now() - startedAt) / 1000),
      error: raw.error ?? null,
      ...(raw.note ? { note: raw.note } : {}),
    };
    await this.#runHook('afterDeliver', { request: prepared, result });
    this.#logDelivery(result, prepared.message);
    return result;
  }

  async #runHook(name, payload) {
    const hooks = this.registry?.hooks?.(name);
    if (!hooks || !hooks.length) return undefined;
    let value;
    for (const hook of hooks) {
      try { const r = await hook(payload); if (r !== undefined) value = r; }
      catch (err) { this.logger.warn(`collab hook ${name} failed: ${err.message}`); }
    }
    return value;
  }

  #logDelivery(result, message) {
    try {
      fs.mkdirSync(this.config.stateDir, { recursive: true });
      fs.appendFileSync(this.config.deliveryLog,
        JSON.stringify({ at: new Date().toISOString(), ...result, message }) + '\n');
    } catch (err) { this.logger.debug(`delivery log failed: ${err.message}`); }
  }

  /**
   * Is a turn currently in flight for this conversation? The hub is the authority: a session with a
   * live stream is listed by `stream/getActiveStreams`. (A conversation whose agent process is merely
   * alive is not "busy" — that distinction causes false refusals if you guess from process state.)
   */
  async #targetStreaming(hub, sessionId) {
    try {
      const streams = await hub.activeStreams();
      return streams.some((s) => s.sessionId === sessionId);
    } catch {
      return false; // cannot tell -> let the send attempt decide
    }
  }

  /**
   * Wait (event-driven) until the target has no turn in flight, bounded by `budgetSec`.
   * Resolves on the hub's `stream/streamFinished` push for that session — not by polling.
   */
  async #waitForTargetIdle(hub, target, budgetSec) {
    if (!budgetSec || budgetSec <= 0) return { waitedSec: 0, idle: true };
    const startedAt = Date.now();
    if (!(await this.#targetStreaming(hub, target.sessionId))) return { waitedSec: 0, idle: true };

    await new Promise((resolve) => {
      const timer = setTimeout(resolve, budgetSec * 1000);
      const stream = hub.openEventStream({
        onEvent: (envelope) => {
          const inner = envelope?.inner ?? {};
          const data = inner.data ?? {};
          if (inner.messageType === 'stream/streamFinished' && data.sessionId === target.sessionId) {
            clearTimeout(timer);
            stream.stop();
            resolve();
          }
        },
      });
    });

    const waitedSec = Math.round((Date.now() - startedAt) / 1000);
    const stillStreaming = await this.#targetStreaming(hub, target.sessionId);
    if (waitedSec) this.logger.debug(`waited ${waitedSec}s for ${target.sessionId} to become idle (stillStreaming=${stillStreaming})`);
    return { waitedSec, idle: !stillStreaming };
  }

  // ------------------------------------------------------------- queue (silent)

  async #enqueue(target, message, timeoutSec) {
    const hub = this.hubFactory(target.workspaceDirectory);
    try {
      const res = await hub.enqueueUserMessage({ sessionId: target.sessionId, text: message, timeoutMs: Math.min(timeoutSec * 1000, 30_000) });
      if (!res.ok) {
        return { mode: 'queue', ok: false, reply: '', error: res.error ?? 'the hub refused to enqueue the message' };
      }
      return {
        mode: 'queue',
        ok: true,
        receipt: res.queueItemId,
        waited: false,
        reply: '',
        note: 'queued silently (no turn started); the target reads it when it next runs',
      };
    } catch (err) {
      return {
        mode: 'queue',
        ok: false,
        reply: '',
        error: `queue delivery needs the desktop client (hub unreachable: ${err.message}); `
          + 'use --wake wake for the offline channel',
      };
    }
  }

  // -------------------------------------------------------------- wake (turn)

  async #wakeLive(target, message, timeoutSec, { wait, meta, busyPolicy }) {
    const transcript = this.store.findTranscript(target.sessionId);
    const before = transcript ? messageCount(readRecords(transcript)) : 0;
    const messageId = crypto.randomUUID();
    const hub = this.hubFactory(target.workspaceDirectory);

    const streamed = [];
    const stream = hub.openEventStream({
      onEvent: (envelope) => {
        const inner = envelope?.inner ?? {};
        const data = inner.data ?? {};
        if (data.streamMessageId !== messageId) return;
        if (inner.messageType === 'llm/streamChat') {
          const part = data.content;
          if (part?.role === 'assistant' && typeof part.content === 'string' && part.content) streamed.push(part.content);
        }
      },
    });

    // The client refuses to start a turn in a conversation that already has one in flight
    // ("currently controlled from another Codely view"). Wait for that turn to end (event-driven),
    // then send; if we still collide, retry a bounded number of times.
    const idle = await this.#waitForTargetIdle(hub, target, busyPolicy?.idleWaitSec ?? 0);
    const attempts = [];

    let response;
    let accepted = false;
    const maxAttempts = Math.max(1, busyPolicy?.retries ?? 1);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        response = await hub.sendUserMessage({
          sessionId: target.sessionId,
          text: message,
          messageId,
          modelTitle: target.selectedChatModelTitle || undefined,
          approvalMode: target.approvalMode || undefined,
          collaborationMode: target.collaborationMode || undefined,
          ...(meta?.messageOptions ? { messageOptions: meta.messageOptions } : {}),
        });
      } catch (err) {
        stream.stop();
        return { mode: 'live', ok: false, reply: '', error: `delivery failed: ${err.message}` };
      }

      const error = response.json?.data?.error;
      if (response.status === 200 && !error) { accepted = true; break; }

      const busy = error && BUSY_TARGET_RE.test(error);
      attempts.push({ attempt, status: response.status, error: error ?? null });
      if (!busy || attempt === maxAttempts) {
        stream.stop();
        return {
          mode: 'live', ok: false, reply: '', attempts: attempts.length,
          error: error ? `hub rejected the message: ${error}` : `hub answered HTTP ${response.status}`,
        };
      }
      this.logger.debug(`target busy (attempt ${attempt}); waiting ${busyPolicy?.retryDelaySec}s then re-checking idle`);
      await new Promise((r) => setTimeout(r, (busyPolicy?.retryDelaySec ?? 0) * 1000));
      await this.#waitForTargetIdle(hub, target, busyPolicy?.idleWaitSec ?? 0);
    }

    // Never report a delivery that was not accepted: if no attempt got through, say so.
    if (!accepted) {
      stream.stop();
      return {
        mode: 'live', ok: false, reply: '', attempts: Math.max(1, attempts.length),
        error: 'no delivery attempt was made (retry policy resolved to zero attempts)',
      };
    }

    if (!wait) {
      stream.stop();
      return {
        mode: 'live',
        ok: true,
        receipt: messageId,
        waited: false,
        reply: '',
        attempts: attempts.length + 1,
        ...(idle.waitedSec ? { waitedForIdleSec: idle.waitedSec } : {}),
        note: 'accepted; the turn was started and not awaited (delivery is completion)',
      };
    }

    const finished = await hub.waitForStreamEnd({
      streamMessageId: messageId,
      timeoutSec,
      isQuiet: transcript ? () => messageCount(readRecords(transcript)) : undefined,
    });
    stream.stop();

    // The end-of-stream event can arrive just before the final assistant message is persisted,
    // so give the transcript a short, bounded settle window and fall back to the streamed deltas.
    const streamedReply = streamed.join('').trim();
    const reply = await settleReply({
      transcript,
      before,
      streamedReply,
      settleMs: this.config.replySettleMs ?? 3000,
    });
    return {
      mode: 'live',
      ok: true,
      receipt: messageId,
      waited: true,
      reply,
      timedOut: !!finished?.timeout,
      attempts: attempts.length + 1,
      ...(idle.waitedSec ? { waitedForIdleSec: idle.waitedSec } : {}),
      deliveredMessages: transcript ? messageCount(readRecords(transcript)) - before : 0,
      note: reply ? undefined : 'no text reply yet (the target may still be running)',
    };
  }

  // ----------------------------------------------------------- offline fallback

  async #sendOffline(target, message, timeoutSec, { force }) {
    const lock = this.store.ownerLock(target);
    if (lock.held && lock.fresh && !force) {
      return {
        mode: 'offline', ok: false, reply: '',
        error: `the target conversation is owned by a live agent (lock refreshed ${Math.round((lock.ageMs ?? 0) / 1000)}s ago). `
          + 'The CLI would fork into a new session instead of appending to this conversation. '
          + 'Wait until it is idle (the client reclaims idle agents after a few minutes), or use the live channel.',
      };
    }

    const transcript = this.store.findTranscript(target.sessionId);
    if (!transcript) return { mode: 'offline', ok: false, reply: '', error: `no transcript found for ${target.sessionId}` };
    if (!this.config.cliPath || !fs.existsSync(this.config.cliPath)) {
      return { mode: 'offline', ok: false, reply: '', error: 'codely CLI not found (set CROSSCHAT_CLI to its path); offline channel unavailable' };
    }

    const before = messageCount(readRecords(transcript));
    const chatsDir = path.dirname(transcript);
    const known = new Set(fs.readdirSync(chatsDir).filter((f) => f.endsWith('.jsonl')));

    const args = ['--resume-session', target.sessionId];
    if (/^(yolo|auto_edit|default)$/.test(target.approvalMode || '')) args.push('--approval-mode', target.approvalMode);
    args.push('-p', message, '--output-format', 'text');

    this.logger.debug(`spawn: ${this.config.cliPath} ${args.join(' ')}`);
    const startedAt = Date.now();
    const proc = await this.spawnProcess(this.config.cliPath, args, target.workspaceDirectory, timeoutSec);
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

    const records = readRecords(transcript);
    const after = messageCount(records);
    const forked = fs.readdirSync(chatsDir).filter((f) => f.endsWith('.jsonl') && !known.has(f));
    const reply = newAssistantText(records, before);

    if (after === before && forked.length) {
      return {
        mode: 'offline', ok: false, elapsedSec, reply: '', waited: true, timedOut: !!proc.timeout,
        error: 'the CLI did not append to the target conversation; it created a new session instead: '
          + `${forked.map((f) => f.replace(/\.jsonl$/, '')).join(', ')}. `
          + 'This usually means the target conversation is owned elsewhere. Use the live channel.',
      };
    }
    const ok = after > before || !!reply;
    return {
      mode: 'offline',
      ok,
      receipt: crypto.randomUUID(),   // generated locally: this channel runs the turn synchronously
      waited: true,
      elapsedSec,
      timedOut: !!proc.timeout,
      deliveredMessages: after - before,
      reply,
      error: ok ? null : (proc.stderr?.trim().split(/\r?\n/).slice(-2).join(' | ') || 'the target conversation received nothing'),
    };
  }
}

/**
 * Read the authoritative reply from the transcript, allowing a short bounded window for the final
 * assistant message to be persisted after the stream ended. Falls back to the streamed deltas.
 */
export async function settleReply({ transcript, before, streamedReply = '', settleMs = 3000, stepMs = 150 }) {
  if (!transcript) return streamedReply;
  const deadline = Date.now() + settleMs;
  for (;;) {
    const fromTranscript = newAssistantText(readRecords(transcript), before);
    if (fromTranscript) return fromTranscript;
    if (Date.now() >= deadline) return streamedReply;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

/** Run a child process, capturing output, with a hard timeout. */
export function runProcess(command, args, cwd, timeoutSec) {  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = '', stderr = '', settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch { /* ignore */ }
      resolve({ code: null, stdout, stderr, timeout: true });
    }, timeoutSec * 1000);
    child.stdout?.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr?.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (err) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + err.message, timeout: false });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve({ code, stdout, stderr, timeout: false });
    });
  });
}
