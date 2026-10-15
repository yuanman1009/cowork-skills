/**
 * Collaboration layer (extension point).
 *
 * `cross-chat` core only knows how to move one message from conversation A to conversation B and
 * read B's reply back. Everything that makes a *team* out of that -- roles, shared task boards,
 * hand-off rules, review gates, art/audio/QA lanes, ... -- belongs in this layer.
 *
 * Design constraints of this layer (deliberate):
 *   - Event driven. Plugins subscribe to hub events (SSE push) and to delivery hooks.
 *     Do NOT build polling/heartbeat loops into a plugin: waiting is a `await` on an event, not a tick.
 *   - No hidden state on disk next to user data: plugins get an explicit `state` store (see below).
 *   - A failing plugin must never break delivery: hook errors are caught and logged.
 *
 * Contract (see docs/COLLAB-CONTRACT.md for the long form):
 *
 *   export default defineCollab({
 *     name: 'my-team-protocol',
 *     apiVersion: 1,
 *     async setup(ctx) {},                       // once, before any delivery
 *     hooks: {
 *       beforeDeliver: async (req) => ({ message, meta }),   // annotate/rewrite outbound message
 *       afterDeliver:  async ({ request, result }) => {},    // observe the outcome
 *       onEvent:       async (envelope) => {},               // every hub envelope (push)
 *     },
 *   });
 *
 * `ctx` = {
 *   config,          resolved configuration (hub url, paths, cli path)
 *   store,           SessionStore (list/resolve/read/ownerLock/findTranscript)
 *   hubFor(workspaceDir) -> HubClient
 *   deliverer,       the core Deliverer (plugins may deliver too, usually via the board API)
 *   state,           plugin-scoped JSON state helper: get/set/patch (persisted under stateDir)
 *   log,             leveled logger
 * }
 */

export const COLLAB_API_VERSION = 1;

import fs from 'node:fs';
import path from 'node:path';

function assertPlugin(plugin) {
  if (!plugin || typeof plugin !== 'object') throw new Error('collab plugin must be an object');
  if (!plugin.name || typeof plugin.name !== 'string') throw new Error('collab plugin needs a name');
  const version = plugin.apiVersion ?? COLLAB_API_VERSION;
  if (version !== COLLAB_API_VERSION) {
    throw new Error(`collab plugin "${plugin.name}" targets apiVersion ${version}, this build provides ${COLLAB_API_VERSION}`);
  }
}

/** Plugin-scoped JSON state persisted under `<stateDir>/collab/<plugin>.json`. */
export function createPluginState({ name, stateDir }) {
  const file = path.join(stateDir, 'collab', `${name}.json`);
  let cache = null;
  const read = () => {
    if (cache) return cache;
    try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { cache = {}; }
    return cache;
  };
  const flush = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cache, null, 2));
  };
  return {
    file,
    get: (key, fallback = null) => (key in read() ? read()[key] : fallback),
    set: (key, value) => { read()[key] = value; flush(); return value; },
    patch: (partial) => { Object.assign(read(), partial); flush(); return read(); },
    all: () => ({ ...read() }),
  };
}

export class CollabRegistry {
  #plugins = new Map();
  #hooks = new Map();
  #context = null;

  /** Register a plugin. Returns the plugin for chaining. */
  register(plugin) {
    assertPlugin(plugin);
    if (this.#plugins.has(plugin.name)) throw new Error(`collab plugin "${plugin.name}" is already registered`);
    this.#plugins.set(plugin.name, plugin);
    for (const [hookName, fn] of Object.entries(plugin.hooks ?? {})) {
      if (typeof fn !== 'function') continue;
      if (!this.#hooks.has(hookName)) this.#hooks.set(hookName, []);
      this.#hooks.get(hookName).push(fn);
    }
    return plugin;
  }

  list() {
    return [...this.#plugins.keys()];
  }

  hooks(name) {
    return this.#hooks.get(name) ?? [];
  }

  /** Give every plugin its context (called once by the CLI / embedding application). */
  async setupAll(context) {
    this.#context = context;
    for (const plugin of this.#plugins.values()) {
      try { await plugin.setup?.({ ...context, state: context.stateFor(plugin.name) }); }
      catch (err) { context.log.warn(`collab plugin "${plugin.name}" setup failed: ${err.message}`); }
    }
  }

  /** Exposed for embedding applications that need the shared context. */
  get context() {
    return this.#context;
  }
}

/** Identity helper: exists for documentation/typing purposes and to validate early. */
export function defineCollab(plugin) {
  assertPlugin(plugin);
  return plugin;
}

/** Built-in no-op plugin: keeps the default behaviour exactly "deliver one message". */
export const passthroughCollab = defineCollab({
  name: 'passthrough',
  apiVersion: COLLAB_API_VERSION,
  description: 'No collaboration protocol: every delivery is a plain one-to-one message.',
});
