/**
 * Public programmatic API.
 *
 * ```js
 * import { createCrossChat } from 'cross-chat';
 *
 * const cc = createCrossChat();                 // reads CROSSCHAT_* env vars
 * console.log(await cc.list());
 * const res = await cc.send({ to: 'My other chat', message: 'run the test suite' });
 * console.log(res.reply);
 * ```
 */
import fs from 'node:fs';
import path from 'node:path';
import { createLogger, resolveConfig } from './config.js';
import { SessionStore } from './store.js';
import { HubClient } from './hub.js';
import { Deliverer } from './deliver.js';
import { CollabRegistry, COLLAB_API_VERSION, createPluginState, defineCollab, passthroughCollab } from './collab/index.js';
import {
  RoleRegistry, buildStamp, parseStamp, stampMessage,
  DEFAULT_INTENT, DEFAULT_WAKE, INTENTS, WAKES,
} from './roles.js';
import { createJob, listJobs, readJob, runJob, spawnWorker } from './schedule.js';

export { resolveConfig, createLogger, discoverCli, which, DEFAULT_HUB_URL } from './config.js';
export {
  SessionStore, loadSessions, resolveSession, messagesOf, readRecords, parseRecords,
  contentText, messageCount, newAssistantText, ownerLockName,
} from './store.js';
export { HubClient, buildInvokeRequest, parseSseEvents } from './hub.js';
export { Deliverer, runProcess } from './deliver.js';
export {
  CollabRegistry, COLLAB_API_VERSION, createPluginState, defineCollab, passthroughCollab,
} from './collab/index.js';
export {
  RoleRegistry, buildStamp, parseStamp, stampMessage,
  DEFAULT_INTENT, DEFAULT_WAKE, INTENTS, WAKES,
} from './roles.js';
export { createJob, listJobs, readJob, runJob, spawnWorker } from './schedule.js';

/**
 * Build a ready-to-use facade.
 * @param {object} [options]
 * @param {object} [options.config]  override resolved configuration
 * @param {boolean} [options.verbose] verbose diagnostics on stderr
 * @param {Array} [options.plugins] collab plugins to register (defaults to the passthrough plugin)
 */
export function createCrossChat({ config, verbose = false, logger, plugins } = {}) {
  const cfg = config ?? resolveConfig();
  const log = logger ?? createLogger({ verbose });
  const store = new SessionStore({
    sessionsRoot: cfg.sessionsRoot,
    tmpRoot: cfg.tmpRoot,
    ownerFreshMs: cfg.ownerFreshMs,
  });
  const registry = new CollabRegistry();
  for (const plugin of plugins ?? [passthroughCollab]) registry.register(plugin);

  const stateFor = (name) => createPluginState({ name, stateDir: cfg.stateDir });
  const hubFor = (workspaceDir) => new HubClient({ baseUrl: cfg.hubUrl, workspaceDir });
  const roles = new RoleRegistry({ file: cfg.rolesFile });
  const deliverer = new Deliverer({ store, config: cfg, logger: log, registry, hubFactory: hubFor, roles });

  const context = {
    config: cfg,
    store,
    registry,
    roles,
    hubFor,
    deliverer,
    stateFor,
    state: stateFor('core'),
    log,
    collabApiVersion: COLLAB_API_VERSION,
    fs,
    path,
  };
  let setupPromise = null;
  const ensureSetup = () => (setupPromise ??= registry.setupAll(context));

  return {
    config: cfg,
    store,
    registry,
    roles,
    log,
    hubFor,
    deliverer,
    context,
    setup: ensureSetup,

    list: () => store.list(),
    resolve: (query) => store.resolve(query),
    /** P1: conversations with runtime state (running / idle) and their bound role names. */
    sessions: () => deliverer.sessions(),
    read: (query, { limit } = {}) => {
      const session = deliverer.resolveTarget(query);
      const { transcript, messages } = store.readMessages(session);
      return {
        session,
        transcript,
        total: messages.length,
        messages: limit ? messages.slice(-limit) : messages,
      };
    },
    active: async () => {
      const sessions = store.list();
      return sessions
        .map((s) => ({ session: s, lock: store.ownerLock(s) }))
        .filter((x) => x.lock.held && x.lock.fresh);
    },
    /** P4: bind a stable role name to a conversation (stored locally, never committed). */
    bindRole: (roleName, target) => {
      const session = store.resolve(target);
      roles.bind(roleName, session.sessionId);
      return { role: roleName, sessionId: session.sessionId, title: session.title };
    },
    unbindRole: (roleName) => roles.unbind(roleName),
    roleList: () => roles.all(),
    send: async (params) => { await ensureSetup(); return deliverer.deliver(params); },
    /** Background deliveries waiting for a busy peer, with their outcomes. */
    scheduled: () => listJobs(cfg),
    /** Run one background delivery (used by the detached worker). */
    deliverJob: (jobId) => runJob({ jobId, config: cfg, deliverer }),
  };
}
