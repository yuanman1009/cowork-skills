/**
 * Background delivery ("deliver when the peer is free").
 *
 * A conversation runs one turn at a time: while the peer is mid-turn, the hub refuses a new turn
 * ("currently controlled from another Codely view") until that turn ends. Waiting inline would block
 * the sending conversation — which the delivery contract forbids (deliver, then stop). So instead:
 *
 *   createJob()  writes the intended delivery to disk and returns a job id
 *   spawnWorker() starts a detached process (`cross-chat deliver-job <id>`) that outlives this turn
 *   runJob()     waits — event-driven — for the peer's stream to end, delivers, and records the outcome
 *
 * A scheduled delivery is **not** a delivery: it has no receipt yet. The job's result file and the
 * delivery ledger are where the proof lands, so nothing is ever silently lost.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The CLI entry point to run in the detached worker. */
export const CLI_ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cross-chat.js');

export function jobPaths(config, jobId) {
  return {
    dir: config.scheduleDir,
    jobFile: path.join(config.scheduleDir, `${jobId}.json`),
    resultFile: path.join(config.scheduleDir, `${jobId}.result.json`),
  };
}

/** Persist an intended delivery. Returns { jobId, jobFile, resultFile, createdAt }. */
export function createJob(config, params) {
  const jobId = crypto.randomUUID();
  const { dir, jobFile, resultFile } = jobPaths(config, jobId);
  fs.mkdirSync(dir, { recursive: true });
  const job = { jobId, createdAt: new Date().toISOString(), params };
  fs.writeFileSync(jobFile, JSON.stringify(job, null, 2));
  return { jobId, jobFile, resultFile, createdAt: job.createdAt };
}

export function readJob(config, jobId) {
  const { jobFile, resultFile } = jobPaths(config, jobId);
  if (!fs.existsSync(jobFile)) throw new Error(`no such scheduled delivery: ${jobId}`);
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const result = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : null;
  return { ...job, result, resultFile };
}

/** Every scheduled delivery with its state, newest first. */
export function listJobs(config) {
  if (!config.scheduleDir || !fs.existsSync(config.scheduleDir)) return [];
  return fs.readdirSync(config.scheduleDir)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.result.json'))
    .map((f) => readJob(config, f.replace(/\.json$/, '')))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * Start the detached worker. It inherits this process's environment (so CROSSCHAT_* config resolves
 * identically) and does not keep the caller alive.
 */
export function spawnWorker({ config, jobId, execPath = process.execPath, entry = CLI_ENTRY }) {
  const child = spawn(execPath, [entry, 'deliver-job', jobId], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  });
  child.unref();
  return child.pid ?? null;
}

/**
 * Worker body: wait for the peer to become free (event-driven), then deliver once.
 * `deliverer` is injectable so the behaviour is testable without spawning anything.
 */
export async function runJob({ jobId, config, deliverer }) {
  const job = readJob(config, jobId);
  const startedAt = Date.now();
  const result = await deliverer.deliver({
    ...job.params,
    // A background job is allowed to wait a long time for the peer, and it is never "scheduled again".
    whenFree: false,
    idleWaitSec: Number(config.scheduleMaxWaitSec) || 0,
    retries: Math.max(1, Math.floor(Number(config.retries) || 1)),
    retryDelaySec: Number(config.retryDelaySec) || 0,
  });

  const outcome = {
    jobId,
    finishedAt: new Date().toISOString(),
    waitedSec: Math.round((Date.now() - startedAt) / 1000),
    ok: !!result.ok,
    receipt: result.receipt ?? null,
    attempts: result.attempts ?? null,
    error: result.error ?? null,
    target: result.target ? { sessionId: result.target.sessionId, title: result.target.title } : null,
  };
  const { resultFile } = jobPaths(config, jobId);
  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  fs.writeFileSync(resultFile, JSON.stringify(outcome, null, 2));
  return outcome;
}
