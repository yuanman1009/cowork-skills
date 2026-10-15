/**
 * Conversation store.
 *
 * Two different stores describe the same conversations, and they are *not* keyed the same way:
 *
 *   1. Session registry  ~/.codely/sessions/<workspace-guid>/sessions.sqlite
 *      table `session_metadata`: sessionId, title, workspaceDirectory, messageCount,
 *      approvalMode, collaborationMode, selectedChatModelTitle, dateUpdated, state, ...
 *
 *   2. Transcript        ~/.codely-cli/tmp/<project-hash>/chats/<sessionId>.jsonl
 *      append-only records, one JSON object per line:
 *        {"t":"header", ...}                    stream header
 *        {"t":"put","seq":N,"msg":{...}}        a message (assistant messages use type "gemini")
 *        {"t":"ckpt"|"session"|"handoff", ...}  bookkeeping
 *
 * <workspace-guid> (e.g. 63d72... ) and <project-hash> (e.g. 3142b5...) are different identifiers,
 * so transcripts are located by searching for the session id instead of converting between them.
 *
 * Ownership: an owning agent holds `chats/.codely-conversation-<sha256(sessionId)>.owner.lock`
 * (an empty *directory* whose mtime is refreshed periodically). A fresh mtime means the
 * conversation is currently driven by a live agent.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

/** CommonJS bridge -- `node:sqlite` is only importable synchronously this way from ESM. */
const require = createRequire(import.meta.url);

export function ownerLockName(sessionId) {
  return `.codely-conversation-${crypto.createHash('sha256').update(sessionId).digest('hex')}.owner.lock`;
}

export function parseRecords(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* ignore partially written lines */ }
  }
  return out;
}

export function readRecords(file) {
  if (!file || !fs.existsSync(file)) return [];
  return parseRecords(fs.readFileSync(file, 'utf8'));
}

export function contentText(msg) {
  const c = msg && msg.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((part) => part.text || part.content || '').join('');
  return '';
}

export function toMessage(record) {
  const msg = record && record.msg;
  if (!msg || !msg.type) return null;
  const role = msg.type === 'user' ? 'user' : msg.type === 'gemini' ? 'assistant' : msg.type;
  return { role, text: contentText(msg), model: msg.model, id: msg.id, timestamp: msg.timestamp };
}

/** All non-empty messages in a transcript, in order. */
export function messagesOf(records) {
  const out = [];
  for (const rec of records) {
    if (rec && rec.t === 'put') {
      const m = toMessage(rec);
      if (m && m.text) out.push(m);
    }
  }
  return out;
}

/** Number of message records (used as a cheap before/after cursor). */
export function messageCount(records) {
  return records.filter((r) => r && r.t === 'put').length;
}

/** Assistant text added after a cursor position. */
export function newAssistantText(records, fromIndex) {
  return messagesOf(records).slice(fromIndex)
    .filter((m) => m.role === 'assistant')
    .map((m) => m.text)
    .join('\n\n')
    .trim();
}

/**
 * Resolve a user supplied target (full id, id prefix or title) to exactly one session.
 * Throws with an actionable message on ambiguity or no match.
 */
export function resolveSession(sessions, query) {
  if (query == null || String(query).trim() === '') throw new Error('missing target (--to)');
  const q = String(query).trim();
  const byId = sessions.filter((s) => s.sessionId === q);
  if (byId.length === 1) return byId[0];
  const byPrefix = sessions.filter((s) => s.sessionId.startsWith(q));
  if (byPrefix.length === 1) return byPrefix[0];
  if (byPrefix.length > 1) {
    throw new Error(`"${q}" matches ${byPrefix.length} session ids; use more characters:\n` +
      byPrefix.map((s) => `  ${s.sessionId}  ${s.title}`).join('\n'));
  }
  const byTitle = sessions.filter((s) => (s.title || '').trim() === q);
  if (byTitle.length === 1) return byTitle[0];
  if (byTitle.length > 1) {
    throw new Error(`title "${q}" matches ${byTitle.length} conversations; use an id prefix instead:\n` +
      byTitle.map((s) => `  ${s.sessionId}  ${s.title}`).join('\n'));
  }
  const fuzzy = sessions.filter((s) => (s.title || '').includes(q));
  if (fuzzy.length === 1) return fuzzy[0];
  if (fuzzy.length > 1) {
    throw new Error(`"${q}" matches multiple conversations; use an id prefix instead:\n` +
      fuzzy.map((s) => `  ${s.sessionId}  ${s.title}`).join('\n'));
  }
  throw new Error(`no conversation matches "${q}" (run: cross-chat list)`);
}

/** Read the session registry (read-only sqlite access). */
export function loadSessions(sessionsRoot) {
  let DatabaseSync;
  try { ({ DatabaseSync } = require('node:sqlite')); }
  catch { throw new Error('node:sqlite is required (Node >= 22.5)'); }
  if (!fs.existsSync(sessionsRoot)) throw new Error(`session registry not found: ${sessionsRoot}`);
  const rows = [];
  for (const guid of fs.readdirSync(sessionsRoot)) {
    const dbPath = path.join(sessionsRoot, guid, 'sessions.sqlite');
    if (!fs.existsSync(dbPath)) continue;
    let db;
    try { db = new DatabaseSync(dbPath, { readOnly: true }); } catch { continue; }
    try {
      for (const row of db.prepare('select * from session_metadata').all()) {
        rows.push({ ...row, workspaceGuid: guid });
      }
    } catch { /* different schema -> skip */ }
    try { db.close(); } catch { /* ignore */ }
  }
  rows.sort((a, b) => Number(b.dateUpdated || 0) - Number(a.dateUpdated || 0));
  return rows;
}

export class SessionStore {
  constructor({ sessionsRoot, tmpRoot, ownerFreshMs = 60_000 }) {
    this.sessionsRoot = sessionsRoot;
    this.tmpRoot = tmpRoot;
    this.ownerFreshMs = ownerFreshMs;
  }

  list() {
    return loadSessions(this.sessionsRoot);
  }

  resolve(query) {
    return resolveSession(this.list(), query);
  }

  /** Transcript path for a session, or null when no transcript exists yet. */
  findTranscript(sessionId) {
    if (!this.tmpRoot || !fs.existsSync(this.tmpRoot)) return null;
    for (const parent of fs.readdirSync(this.tmpRoot)) {
      const candidate = path.join(this.tmpRoot, parent, 'chats', `${sessionId}.jsonl`);
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  /**
   * Ownership probe. `held` = a lock directory exists, `fresh` = it was refreshed recently,
   * which means a live agent currently drives that conversation.
   */
  ownerLock(session) {
    const transcript = this.findTranscript(session.sessionId);
    if (!transcript) return { held: false, fresh: false, ageMs: null, path: null };
    const lockPath = path.join(path.dirname(transcript), ownerLockName(session.sessionId));
    if (!fs.existsSync(lockPath)) return { held: false, fresh: false, ageMs: null, path: lockPath };
    const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
    return { held: true, fresh: ageMs < this.ownerFreshMs, ageMs, path: lockPath };
  }

  readMessages(session) {
    const transcript = this.findTranscript(session.sessionId);
    return { transcript, messages: messagesOf(readRecords(transcript)) };
  }
}
