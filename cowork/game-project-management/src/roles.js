/**
 * Two things the delivery contract needs beyond raw transport:
 *
 * 1. **Structured markers** (INTENT + WAKE) carried with every delivery, so the receiver never has
 *    to infer "am I supposed to act?" from prose, and so nothing accidentally burns a turn of the
 *    target's budget. The canonical form is a single machine-parseable stamp line:
 *
 *        [cross-chat intent=notice wake=queue from=art-lead ticket=T-7]
 *
 *    Fail-safe defaults: `intent=notice` (tell only) and `wake=queue` (do not start a turn).
 *    Omitted parameters therefore degrade to "the message waits quietly", never to "a budget was spent".
 *
 * 2. **Role addressing** (ROLE REGISTRY): conversations are addressed by stable logical role names,
 *    never by session ids in long-lived documents. Session ids expire and turn into ghost targets
 *    whose deliveries "look successful" while nobody receives them. The mapping file therefore lives
 *    in the local state directory and must not be committed to version control.
 */
import fs from 'node:fs';
import path from 'node:path';

export const INTENTS = ['notice', 'work'];
export const WAKES = ['queue', 'wake'];
export const DEFAULT_INTENT = 'notice';
export const DEFAULT_WAKE = 'queue';

export function assertIntent(intent) {
  if (!INTENTS.includes(intent)) throw new Error(`invalid intent "${intent}" (expected: notice | work)`);
  return intent;
}

export function assertWake(wake) {
  if (!WAKES.includes(wake)) throw new Error(`invalid wake "${wake}" (expected: queue | wake)`);
  return wake;
}

/** Build the canonical stamp line. Returns '' when there is nothing worth stamping. */
export function buildStamp({ intent = DEFAULT_INTENT, wake = DEFAULT_WAKE, from, ticket } = {}) {
  const parts = [`intent=${assertIntent(intent)}`, `wake=${assertWake(wake)}`];
  if (from) parts.push(`from=${token(from)}`);
  if (ticket) parts.push(`ticket=${token(ticket)}`);
  return `[cross-chat ${parts.join(' ')}]`;
}

/** Parse a stamp written by buildStamp. Returns null when the text carries none. */
export function parseStamp(text) {
  const match = String(text ?? '').match(/\[cross-chat([^\]]*)\]/);
  if (!match) return null;
  const fields = {};
  for (const token of match[1].trim().split(/\s+/)) {
    const [key, value] = token.split('=');
    if (key && value) fields[key] = value;
  }
  return fields;
}

/** Prepend the stamp to a message body. */
export function stampMessage(message, markers) {
  const stamp = buildStamp(markers);
  return stamp ? `${stamp}\n${message}` : String(message);
}

function token(value) {
  return String(value).trim().replace(/\s+/g, '-');
}

/**
 * Role name -> session id mapping, stored as JSON in the local state directory.
 * Never part of version control: it goes stale when conversations are recreated.
 */
export class RoleRegistry {
  constructor({ file, fs: fsImpl = fs }) {
    this.file = file;
    this.fs = fsImpl;
  }

  #read() {
    try { return JSON.parse(this.fs.readFileSync(this.file, 'utf8')) ?? {}; } catch { return {}; }
  }

  #write(data) {
    this.fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
  }

  /** All bindings: { roleName: sessionId }. */
  all() {
    return this.#read();
  }

  /** Bound session id for a role name, or null. */
  resolveRole(roleName) {
    const bindings = this.#read();
    return bindings[roleName] ?? null;
  }

  bind(roleName, sessionId) {
    if (!roleName || !String(roleName).trim()) throw new Error('role name is required');
    if (!sessionId || !String(sessionId).trim()) throw new Error('session id is required');
    const bindings = this.#read();
    bindings[String(roleName).trim()] = String(sessionId).trim();
    this.#write(bindings);
    return bindings;
  }

  unbind(roleName) {
    const bindings = this.#read();
    delete bindings[roleName];
    this.#write(bindings);
    return bindings;
  }

  /** Reverse lookup used when listing conversations. */
  rolesOf(sessionId) {
    return Object.entries(this.#read())
      .filter(([, id]) => id === sessionId)
      .map(([role]) => role);
  }
}
