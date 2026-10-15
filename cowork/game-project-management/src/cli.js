/**
 * Command line interface.
 *
 *   cross-chat list                                   conversations + runtime state + bound roles
 *   cross-chat read   --to <target> [--n 6]            last messages of a conversation
 *   cross-chat send   --to <target> --message "…"      deliver a stamped message (P2) and get a receipt
 *   cross-chat active                                  which conversations are being driven right now
 *   cross-chat role bind <role> --to <target>          bind a stable role name to a conversation
 *   cross-chat role list | unbind <role>
 *   cross-chat scheduled | cancel <jobId>             background deliveries and their outcomes
 *   cross-chat version
 *
 * Fail-safe defaults: --intent notice (tell only) and --wake queue (silent inbox, starts nothing).
 * Pass --wake wake when the peer must actually run, and --wait only when you deliberately want to
 * read the answer back in this turn.
 *
 * Language: CROSSCHAT_LANG=zh for Chinese output (default: English).
 */
import { createCrossChat } from './index.js';
import { resolveConfig } from './config.js';
import { DEFAULT_INTENT, DEFAULT_WAKE, INTENTS, WAKES } from './roles.js';
import { runJob } from './schedule.js';
import fs from 'node:fs';

const USAGE = `cross-chat -- deliver a message from one conversation to another one

Usage:
  cross-chat list
  cross-chat read   --to <role|id|title> [--n 6]
  cross-chat send   --to <role|id|title> --message "<text>" [options]
  cross-chat active
  cross-chat role bind <role> --to <role|id|title> | role list | role unbind <role>
  cross-chat scheduled [--json]
  cross-chat version

Delivery markers (structured, never inferred from prose):
  --intent notice|work    notice = tell only (default) · work = the peer must act
  --wake   queue|wake     queue = silent inbox, starts nothing (default) · wake = start a turn now
  --from <role>           sender role name, carried in the stamp
  --ticket <id>           work item id, carried in the stamp

Options:
  --wait                  wait for the turn and read the reply back (default: deliver and return)
  --timeout <sec>         bound for --wait (default 300)
  --wait-for-idle <sec>   if the peer already has a turn in flight, wait up to this long for it to
                          end before sending (default 60; 0 = send immediately)
  --retry <n>             attempts when the peer is still busy (default 3)
  --retry-delay <sec>     pause between those attempts (default 5)
  --when-free             if the peer is mid-turn, hand the delivery to a background worker that
                          waits for that turn to end and then delivers (returns immediately, so this
                          conversation is not held open). Check it with "cross-chat scheduled".
  --message-file <path>   read the body from a UTF-8 file instead of --message. Use this when the text
                          contains shell metacharacters: a .cmd wrapper cannot carry "%" verbatim.
  --live | --offline      force a channel (default: the hub when it answers, otherwise the CLI)
  --force                 bypass the "target is busy" guard (offline channel)
  --n <count>             number of messages to print for "read"
  --json                  machine readable output (includes receipt)
  --debug                 verbose diagnostics on stderr

Environment:
  CROSSCHAT_HUB, CROSSCHAT_SESSIONS_ROOT, CROSSCHAT_TMP_ROOT, CROSSCHAT_STATE_DIR,
  CROSSCHAT_CLI, CROSSCHAT_TIMEOUT_SEC, CROSSCHAT_IDLE_WAIT_SEC, CROSSCHAT_RETRIES,
  CROSSCHAT_RETRY_DELAY_SEC, CROSSCHAT_LANG
`;

const MESSAGES = {
  en: {
    listHeader: 'Conversations (most recently used first):',
    noSessions: '(no conversations found)',
    running: (s) => `   [running, heartbeat ${s}s ago]`,
    idle: '   [idle]',
    roles: (names) => `   roles: ${names.join(', ')}`,
    messages: (shown, total, title) => `"${title}" last ${shown} / ${total} messages:`,
    roleUser: 'user', roleAssistant: 'assistant',
    delivered: (r) => `[delivered:${r.mode}${r.wake === 'wake' ? '/wake' : '/queue'}] ${r.target.title} (${r.target.sessionId})  ${r.elapsedSec}s`,
    receipt: (id) => `[receipt] ${id ?? '(none)'}`,
    queuedNote: '[note] queued silently: intent=notice, wake=queue -> nothing was started. Add --wake wake to make the peer run now.',
    timeoutWarn: '[warn] timed out; the target conversation may still be working in the background.',
    noReply: '[reply] no text reply (delivery is completion; do not ask the peer to acknowledge).',
    reply: (text) => `[reply]\n${text}`,
    failed: (error) => `[failed] ${error}`,
    warning: (text) => `[warn] ${text}`,
    idleWaited: (s) => `[idle] waited ${s}s for the peer's turn to end before delivering.`,
    attempts: (n) => `[retry] delivered on attempt ${n}.`,
    scheduled: (id) => `[scheduled] the peer has a turn in flight — handed to a background delivery (job ${id}).`,
    scheduledHint: '[note] not delivered yet: no receipt until it lands. Check with: cross-chat scheduled',
    noJobs: '(no background deliveries)',
    jobHeader: 'Background deliveries (newest first):',
    jobWaiting: 'waiting for the peer',
    jobDelivered: 'delivered',
    jobFailed: 'failed',
    jobLine: (id, from, to, state, receipt, error) =>
      `  ${id}  from=${from}  to=${String(to).slice(0, 8)}…  ${state}`
      + (receipt ? `  receipt=${receipt}` : '') + (error ? `  error=${error}` : ''),
    activeHeader: 'Conversations currently driven by a live agent:',
    activeNone: '  (none)',
    activeLine: (id, title, s) => `  ${id}  "${title}"  heartbeat ${s}s ago`,
    hubStreams: (ids) => `hub active streams: ${ids.length ? ids.join(', ') : '(none)'}`,
    hubUnreachable: 'hub unreachable; skipping the active stream query.',
    bound: (r) => `[role] ${r.role} -> ${r.sessionId}  "${r.title}"`,
    unbound: (name) => `[role] ${name} unbound`,
    noRoles: '(no role bindings)',
    roleHeader: 'Role bindings (local state; never commit these):',
  },
  zh: {
    listHeader: '对话列表(按最近使用排序):',
    noSessions: '(没有找到任何对话)',
    running: (s) => `   [运行中,${s}s 前有心跳]`,
    idle: '   [空闲]',
    roles: (names) => `   角色: ${names.join(', ')}`,
    messages: (shown, total, title) => `「${title}」最近 ${shown} / ${total} 条消息:`,
    roleUser: '用户', roleAssistant: '助手',
    delivered: (r) => `[已投递:${r.mode}${r.wake === 'wake' ? '/唤醒' : '/静默'}] ${r.target.title} (${r.target.sessionId})  用时 ${r.elapsedSec}s`,
    receipt: (id) => `[回执] ${id ?? '(无)'}`,
    queuedNote: '[提示] 已静默入队:intent=notice、wake=queue,没有启动任何执行。要让它现在就跑,加 --wake wake。',
    timeoutWarn: '[警告] 等待超时,目标对话可能仍在后台执行。',
    noReply: '[回复] 无文本回复(投递即完成,不要要求对方回执)。',
    reply: (text) => `[回复]\n${text}`,
    failed: (error) => `[失败] ${error}`,
    warning: (text) => `[警告] ${text}`,
    idleWaited: (s) => `[空闲等待] 对方的回合还没结束,已等待 ${s}s 后才投递。`,
    attempts: (n) => `[重试] 第 ${n} 次尝试投递成功。`,
    scheduled: (id) => `[已排入后台] 对方正在跑回合 —— 已交给后台投递(任务 ${id})。`,
    scheduledHint: '[提示] 尚未送达:拿到回执才算出。用 cross-chat scheduled 查看结果。',
    noJobs: '(没有后台投递任务)',
    jobHeader: '后台投递任务(最新在前):',
    jobWaiting: '等待对方空闲',
    jobDelivered: '已送达',
    jobFailed: '失败',
    jobLine: (id, from, to, state, receipt, error) =>
      `  ${id}  发件=${from}  收件=${String(to).slice(0, 8)}…  ${state}`
      + (receipt ? `  回执=${receipt}` : '') + (error ? `  错误=${error}` : ''),
    activeHeader: '正在被活动 agent 驱动的对话:',
    activeNone: '  (无)',
    activeLine: (id, title, s) => `  ${id}  「${title}」  ${s}s 前有心跳`,
    hubStreams: (ids) => `Hub 报告的活跃流: ${ids.length ? ids.join(', ') : '(无)'}`,
    hubUnreachable: 'Hub 不可用,跳过活跃流查询。',
    bound: (r) => `[角色] ${r.role} -> ${r.sessionId}  「${r.title}」`,
    unbound: (name) => `[角色] ${name} 已解绑`,
    noRoles: '(没有角色绑定)',
    roleHeader: '角色绑定(本地状态,不要提交到版本库):',
  },
};

export function pickMessages(env = process.env) {
  const lang = String(env.CROSSCHAT_LANG ?? env.LANG ?? '').toLowerCase();
  return lang.startsWith('zh') ? MESSAGES.zh : MESSAGES.en;
}

const FLAGS = new Set([
  'force', 'json', 'debug', 'live', 'offline', 'wait', 'no-wait', 'when-free', 'help', 'version',
]);

/** Minimal argv parser: `--flag`, `--key value`, and bare words. */
export function parseArgs(argv = []) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { out._.push(arg); continue; }
    const key = arg.slice(2);
    if (FLAGS.has(key)) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
}

function formatTime(ms) {
  const n = Number(ms || 0);
  return n ? new Date(n).toLocaleString() : '-';
}

export async function main(argv = process.argv.slice(2), { env = process.env, stdout = process.stdout } = {}) {
  const t = pickMessages(env);
  const command = argv[0];
  const opts = parseArgs(argv.slice(1));

  if (!command || command === 'help' || command === '--help' || command === '-h' || opts.help) {
    stdout.write(USAGE);
    return 0;
  }
  if (command === 'version' || opts.version) {
    stdout.write('cross-chat 0.1.0\n');
    return 0;
  }

  const config = resolveConfig(env);
  const cc = createCrossChat({ config, verbose: !!opts.debug });
  const write = (s) => stdout.write(s + '\n');

  // Hidden worker command: performs one scheduled delivery and writes its outcome. Started detached
  // by `send --when-free`; not part of the documented interface.
  if (command === 'deliver-job') {
    const jobId = opts._[0];
    if (!jobId) { stdout.write('deliver-job needs a job id\n'); return 1; }
    try {
      const outcome = await runJob({ jobId, config, deliverer: cc.deliverer });
      if (opts.debug) process.stderr.write(`[debug] job ${jobId} -> ${JSON.stringify(outcome)}\n`);
      return outcome.ok ? 0 : 2;
    } catch (err) {
      process.stderr.write(`[cross-chat] scheduled delivery ${jobId} failed: ${err.message}\n`);
      return 1;
    }
  }

  switch (command) {
    case 'list': {
      const rows = cc.list();
      const runtime = new Map(cc.sessions().map((s) => [s.sessionId, s]));
      if (opts.json) { write(JSON.stringify(cc.sessions(), null, 2)); return 0; }
      if (!rows.length) { write(t.noSessions); return 0; }
      write(t.listHeader);
      for (const s of rows) {
        const state = runtime.get(s.sessionId);
        write(`  ${s.sessionId}  "${s.title || '(untitled)'}"${state?.runtime === 'running' ? t.running(state.heartbeatAgeSec) : t.idle}`);
        write(`      workspace: ${s.workspaceDirectory}`);
        write(`      messages: ${s.messageCount}   updated: ${formatTime(s.dateUpdated)}   approval: ${s.approvalMode || '-'}`);
        if (state?.roles?.length) write(t.roles(state.roles));
      }
      return 0;
    }

    case 'scheduled': {
      const jobs = cc.scheduled();
      if (opts.json) { write(JSON.stringify(jobs, null, 2)); return 0; }
      if (!jobs.length) { write(t.noJobs); return 0; }
      write(t.jobHeader);
      for (const job of jobs) {
        const state = job.result ? (job.result.ok ? t.jobDelivered : t.jobFailed) : t.jobWaiting;
        write(t.jobLine(job.jobId, job.params?.from ?? '-', job.params?.to ?? '-', state,
          job.result?.receipt ?? null, job.result?.error ?? null));
      }
      return 0;
    }

    case 'role': {
      const [action, roleName] = opts._;
      if (action === 'bind') {
        if (!roleName) { write(t.failed('usage: cross-chat role bind <role> --to <target>')); return 1; }
        if (!opts.to) { write(t.failed('usage: cross-chat role bind <role> --to <target>')); return 1; }
        write(t.bound(cc.bindRole(roleName, opts.to)));
        return 0;
      }
      if (action === 'unbind') {
        if (!roleName) { write(t.failed('usage: cross-chat role unbind <role>')); return 1; }
        cc.unbindRole(roleName);
        write(t.unbound(roleName));
        return 0;
      }
      const bindings = cc.roleList();
      const entries = Object.entries(bindings);
      if (opts.json) { write(JSON.stringify(bindings, null, 2)); return 0; }
      if (!entries.length) { write(t.noRoles); return 0; }
      write(t.roleHeader);
      for (const [role, sessionId] of entries) {
        let title = '(unknown session)';
        try { title = cc.store.resolve(sessionId).title; } catch { /* keep placeholder */ }
        write(`  ${role} -> ${sessionId}  "${title}"`);
      }
      return 0;
    }

    case 'read': {
      const { session, messages, transcript, total } = cc.read(opts.to, { limit: Number(opts.n || 6) });
      if (opts.debug) process.stderr.write(`[debug] transcript: ${transcript}\n`);
      if (opts.json) { write(JSON.stringify({ session, total, messages }, null, 2)); return 0; }
      write(t.messages(messages.length, total, session.title));
      for (const m of messages) {
        write(`\n  [${m.role === 'user' ? t.roleUser : t.roleAssistant}] ${m.text.slice(0, 2000)}`);
      }
      return 0;
    }

    case 'active': {
      const active = await cc.active();
      if (opts.json) { write(JSON.stringify(active, null, 2)); return 0; }
      write(t.activeHeader);
      if (!active.length) write(t.activeNone);
      for (const { session, lock } of active) {
        write(t.activeLine(session.sessionId, session.title, Math.round((lock.ageMs ?? 0) / 1000)));
      }
      try {
        const streams = await cc.hubFor(active[0]?.session.workspaceDirectory ?? cc.list()[0]?.workspaceDirectory).activeStreams();
        write(t.hubStreams(streams.map((s) => s.sessionId)));
      } catch { write(t.hubUnreachable); }
      return 0;
    }

    case 'send': {
      if (!opts.to) { write(t.failed('missing --to <target>')); return 1; }
      if (opts.message && opts['message-file']) {
        write(t.failed('give either --message or --message-file, not both'));
        return 1;
      }
      // `--message-file` exists because a shell wrapper can mangle the body: cmd.exe eats `%` inside
      // an argument, so text such as "进度 50%" would reach the peer corrupted. A file carries it verbatim.
      let body = opts.message;
      if (opts['message-file']) {
        try {
          body = fs.readFileSync(opts['message-file'], 'utf8').replace(/[\r\n]+$/, '');
        } catch (err) {
          write(t.failed(`cannot read --message-file ${opts['message-file']}: ${err.message}`));
          return 1;
        }
      }
      if (!body) { write(t.failed('missing --message "<text>" (or --message-file <path>)')); return 1; }
      const intent = opts.intent ?? DEFAULT_INTENT;
      const wake = opts.wake ?? DEFAULT_WAKE;
      if (!INTENTS.includes(intent)) { write(t.failed(`--intent must be one of: ${INTENTS.join(' | ')}`)); return 1; }
      if (!WAKES.includes(wake)) { write(t.failed(`--wake must be one of: ${WAKES.join(' | ')}`)); return 1; }

      await cc.setup();
      const result = await cc.send({
        to: opts.to,
        message: body,
        intent,
        wake,
        from: opts.from,
        ticket: opts.ticket,
        mode: opts.live ? 'live' : opts.offline ? 'offline' : 'auto',
        timeoutSec: opts.timeout ? Number(opts.timeout) : undefined,
        wait: !!opts.wait && !opts['no-wait'],
        force: !!opts.force,
        whenFree: !!opts['when-free'],
        ...(opts['wait-for-idle'] !== undefined ? { idleWaitSec: Number(opts['wait-for-idle']) } : {}),
        ...(opts.retry !== undefined ? { retries: Number(opts.retry) } : {}),
        ...(opts['retry-delay'] !== undefined ? { retryDelaySec: Number(opts['retry-delay']) } : {}),
      });
      if (opts.json) { write(JSON.stringify(result, null, 2)); return result.ok ? 0 : 2; }
      if (!result.ok) { write(t.failed(result.error || 'unknown error')); return 2; }
      for (const warning of result.warnings ?? []) write(t.warning(warning));
      if (result.scheduled) {
        write(t.scheduled(result.jobId));
        write(t.scheduledHint);
        return 0;
      }
      write(t.delivered(result));
      write(t.receipt(result.receipt));
      if (result.waitedForIdleSec) write(t.idleWaited(result.waitedForIdleSec));
      if (result.attempts > 1) write(t.attempts(result.attempts));
      if (result.wake === 'queue' && intent === 'notice') write(t.queuedNote);
      if (result.timedOut) write(t.timeoutWarn);
      if (result.waited) write(result.reply ? t.reply(result.reply) : t.noReply);
      return 0;
    }

    default:
      stdout.write(`unknown command "${command}"\n\n` + USAGE);
      return 1;
  }
}
