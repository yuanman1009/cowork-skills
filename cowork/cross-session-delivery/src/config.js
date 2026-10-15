/**
 * Configuration & discovery.
 *
 * Everything is overridable by environment variable so the tool stays portable and testable:
 *   CROSSCHAT_HUB            hub base URL                     (default http://127.0.0.1:31415)
 *   CROSSCHAT_SESSIONS_ROOT  <home>/.codely/sessions          (session registry)
 *   CROSSCHAT_TMP_ROOT       <home>/.codely-cli/tmp           (transcripts)
 *   CROSSCHAT_STATE_DIR      <home>/.codely-cli/cross-chat    (delivery ledger)
 *   CROSSCHAT_CLI            explicit path to the codely CLI   (offline mode)
 *
 * NOTE: the desktop client exports `CODELY_CLI=1` as a boolean flag -- it is *not* a path.
 * Use CROSSCHAT_CLI when you need to point at a specific binary.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_HUB_URL = 'http://127.0.0.1:31415';
export const DEFAULT_TIMEOUT_SEC = 300;
/** A session owner lock refreshed within this window means a live agent owns the conversation. */
export const DEFAULT_OWNER_FRESH_MS = 60_000;
/** How long to wait for a peer's in-flight turn to end before giving up (0 = do not wait). */
export const DEFAULT_IDLE_WAIT_SEC = 60;
export const DEFAULT_RETRIES = 3;
export const DEFAULT_RETRY_DELAY_SEC = 5;
/** How long a background delivery may wait for the peer's turn to end (30 minutes). */
export const DEFAULT_SCHEDULE_MAX_WAIT_SEC = 1800;

function firstExisting(candidates) {
  for (const p of candidates) {
    if (!p) continue;
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
}

/** Minimal `which`: walks PATH looking for an executable (honours PATHEXT on Windows). */
export function which(command, env = process.env) {
  const pathValue = env.PATH || env.Path || '';
  if (!pathValue) return null;
  const exts = process.platform === 'win32'
    ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, command + ext);
      try { if (fs.existsSync(candidate)) return candidate; } catch { /* ignore */ }
    }
  }
  return null;
}

/**
 * Find the codely CLI used by the offline (headless resume) delivery mode.
 * Returns null when it cannot be found -- live mode still works in that case.
 */
export function discoverCli(env = process.env, home = os.homedir()) {
  const exe = process.platform === 'win32' ? 'codely.exe' : 'codely';
  const platformDir = `${process.platform}-${process.arch}`;
  const candidates = [];

  if (env.CODELY_HOME) candidates.push(path.join(env.CODELY_HOME, exe));
  if (env.CODELY_CLI_BASE_DIR) {
    candidates.push(path.join(env.CODELY_CLI_BASE_DIR, 'bin', platformDir, exe));
    candidates.push(path.join(env.CODELY_CLI_BASE_DIR, 'bin', exe));
    candidates.push(path.join(env.CODELY_CLI_BASE_DIR, exe));
  }
  candidates.push(path.join(home, '.local', 'bin', exe));
  if (process.platform === 'win32') {
    candidates.push(path.join(home, 'AppData', 'Local', 'Programs', 'codely', exe));
    candidates.push(path.join(home, 'AppData', 'Local', 'Codely', exe));
  } else {
    candidates.push('/usr/local/bin/' + exe);
    candidates.push('/opt/codely/bin/' + exe);
  }

  return firstExisting(candidates) || which('codely', env);
}

export function resolveConfig(env = process.env, home = os.homedir()) {
  const stateDir = env.CROSSCHAT_STATE_DIR || path.join(home, '.codely-cli', 'cross-chat');
  return {
    hubUrl: env.CROSSCHAT_HUB || DEFAULT_HUB_URL,
    sessionsRoot: env.CROSSCHAT_SESSIONS_ROOT || path.join(home, '.codely', 'sessions'),
    tmpRoot: env.CROSSCHAT_TMP_ROOT || path.join(home, '.codely-cli', 'tmp'),
    stateDir,
    deliveryLog: path.join(stateDir, 'deliveries.jsonl'),
    /** Role name -> session id map. Local state, never version controlled (it goes stale). */
    rolesFile: path.join(stateDir, 'roles.json'),
    cliPath: env.CROSSCHAT_CLI || discoverCli(env, home),
    defaultTimeoutSec: Number(env.CROSSCHAT_TIMEOUT_SEC || DEFAULT_TIMEOUT_SEC),
    ownerFreshMs: Number(env.CROSSCHAT_OWNER_FRESH_MS || DEFAULT_OWNER_FRESH_MS),
    /**
     * The client refuses to start a turn in a conversation that already has one in flight
     * ("currently controlled from another Codely view"). These bound how long we wait for that
     * turn to end and how often we retry: waiting is event-driven, retrying is limited.
     */
    idleWaitSec: Number(env.CROSSCHAT_IDLE_WAIT_SEC ?? DEFAULT_IDLE_WAIT_SEC),
    retries: Number(env.CROSSCHAT_RETRIES || DEFAULT_RETRIES),
    retryDelaySec: Number(env.CROSSCHAT_RETRY_DELAY_SEC || DEFAULT_RETRY_DELAY_SEC),
    /** Where a background delivery (`--when-free`) waits for the peer to become free. */
    scheduleDir: path.join(stateDir, 'scheduled'),
    /** How long that background delivery may wait in total. */
    scheduleMaxWaitSec: Number(env.CROSSCHAT_SCHEDULE_MAX_WAIT_SEC || DEFAULT_SCHEDULE_MAX_WAIT_SEC),
  };
}

/** Tiny leveled logger; diagnostics go to stderr so stdout stays machine-readable. */
export function createLogger({ verbose = false, stream = process.stderr } = {}) {
  const write = (level, msg) => stream.write(`[${level}] ${msg}\n`);
  return {
    info: (m) => write('cross-chat', m),
    warn: (m) => write('warn', m),
    error: (m) => write('error', m),
    debug: (m) => { if (verbose) write('debug', m); },
  };
}
