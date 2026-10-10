// Gate decisions. Pure: everything that touches git or the filesystem comes in
// through ctx.env, so the decision table in test/gates.test.mjs can drive it.
//
//   decide(event, ctx) -> { allow: true } | { allow: false, gate, reason }
//
// event: a Claude Code PreToolUse payload ({ tool_name, tool_input, cwd }).
// ctx:   { policy, projectDir, env: { currentBranch(dir), approvals(), sha(rel),
//          migrationTreeMatchesDefault(), receipts(), pkgScripts(dir), now() } }

import path from 'node:path';
import os from 'node:os';
import { parseCommands, base } from './shell.mjs';
import { contentSha } from './hash.mjs';
import { matchesAny } from './glob.mjs';

const ALLOW = Object.freeze({ allow: true });
const block = (gate, reason) => ({ allow: false, gate, reason });

const ENV_FILE = /^\.env(\.(?!example$|sample$|template$|dist$)[\w.-]+)?$/;
const READERS = new Set(['cat', 'less', 'more', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'awk', 'sed',
  'bat', 'strings', 'xxd', 'od', 'base64', 'nl', 'cut', 'sort', 'uniq', 'diff', 'cp', 'scp', 'rsync', 'curl', 'tac', 'jq']);
const PRINTERS = new Set(['echo', 'printf', 'node', 'python', 'python3', 'ruby', 'perl', 'deno', 'bun', 'php',
  'awk', 'curl', 'wget', 'nc', 'http', 'https', 'tee', 'logger']);
const SCRIPT_RUNNERS = { npm: ['run', 'run-script'], pnpm: ['run'], yarn: ['run'], bun: ['run'] };
const NPM_BUILTIN_SCRIPTS = new Set(['test', 'start', 'stop', 'restart']);
const PM_BUILTINS = new Set(['install', 'i', 'add', 'remove', 'rm', 'update', 'up', 'exec', 'dlx', 'ci', 'init', 'create',
  'publish', 'pack', 'link', 'list', 'ls', 'outdated', 'audit', 'why', 'config', 'store', 'cache', 'import', 'help']);
const WRITE_SQL = /\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|comment\s+on|vacuum|reindex|copy|call|do|lock|refresh|security\s+label|cluster|discard|import|reassign)\b/i;

export function decide(event, ctx) {
  const name = event?.tool_name ?? '';
  const input = event?.tool_input ?? {};
  const cwd = event?.cwd || ctx.projectDir;

  if (name === 'Bash') return decideBash(String(input.command ?? ''), cwd, ctx);

  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(name)) {
    const target = input.file_path ?? input.notebook_path;
    return governance([target], cwd, ctx);
  }
  if (name === 'Read' || name === 'Grep') {
    const target = input.file_path ?? input.path;
    if (ctx.policy.gates.secrets.mode === 'block' && target && ENV_FILE.test(base(target))) {
      return block('secrets', `reading ${base(target)} would put live credentials in the transcript. Ask the approver for the value you need, or use a test credential.`);
    }
    return ALLOW;
  }

  const mcp = /^mcp__.+__([A-Za-z0-9_]+)$/.exec(name);
  if (mcp) return decideMcp(mcp[1], input, ctx);
  return ALLOW;
}

// ---------------------------------------------------------------- Bash ----

function decideBash(command, cwd, ctx) {
  const cmds = expandScripts(parseCommands(command), cwd, ctx, 0);
  for (const cmd of cmds) {
    const d = governanceBash(cmd, cwd, ctx) ?? secretsBash(cmd, ctx) ?? migrationBash(cmd, ctx)
      ?? pushBash(cmd, cwd, ctx) ?? mergeBash(cmd, ctx) ?? deployBash(cmd, ctx);
    if (d) return d;
  }
  return ALLOW;
}

/** `npm run db:deploy` → also inspect the package.json script it runs. */
function expandScripts(cmds, cwd, ctx, depth) {
  if (depth > 3) return cmds;
  const out = [];
  for (const cmd of cmds) {
    out.push(cmd);
    const prog = base(cmd.argv[0]);
    let scriptName = null;
    if (SCRIPT_RUNNERS[prog]?.includes(cmd.argv[1])) scriptName = cmd.argv[2];
    else if (prog === 'npm' && NPM_BUILTIN_SCRIPTS.has(cmd.argv[1])) scriptName = cmd.argv[1];
    else if ((prog === 'pnpm' || prog === 'yarn') && cmd.argv[1] && !cmd.argv[1].startsWith('-') && !PM_BUILTINS.has(cmd.argv[1])) scriptName = cmd.argv[1];
    if (!scriptName) continue;
    const scripts = safe(() => ctx.env.pkgScripts(cwd), {}) ?? {};
    const body = scripts[scriptName];
    if (typeof body === 'string') {
      const inner = parseCommands(body).map((c) => ({ ...c, assigns: { ...cmd.assigns, ...c.assigns } }));
      out.push(...expandScripts(inner, cwd, ctx, depth + 1));
    }
  }
  return out;
}

function governanceBash(cmd, cwd, ctx) {
  const prog = base(cmd.argv[0]);
  const args = cmd.argv.slice(1);
  const paths = [...cmd.redirects];
  const nonFlags = args.filter((a) => !a.startsWith('-'));
  if (['rm', 'unlink', 'truncate', 'chmod', 'chown', 'touch', 'shred'].includes(prog)) paths.push(...nonFlags);
  if (['mv', 'cp', 'ln', 'install', 'rsync'].includes(prog)) paths.push(...nonFlags.slice(-1), ...(prog === 'mv' ? nonFlags : []));
  if (prog === 'tee') paths.push(...nonFlags);
  if ((prog === 'sed' || prog === 'perl') && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) paths.push(...nonFlags);
  if (prog === 'git' && ['rm', 'mv', 'restore', 'checkout'].includes(args[0])) paths.push(...args.slice(1).filter((a) => !a.startsWith('-')));
  if (!paths.length) return null;
  const d = governance(paths, cwd, ctx);
  return d.allow ? null : d;
}

function governance(targets, cwd, ctx) {
  if (ctx.policy.gates.governance.mode !== 'block') return ALLOW;
  for (const t of targets) {
    if (!t) continue;
    const hit = governedPath(t, cwd, ctx);
    if (hit) {
      return block('governance', `${hit} is a Keel governance file. Agents can't change their own gates; the approver edits it and runs \`keel compile\`.`);
    }
  }
  return ALLOW;
}

function governedPath(target, cwd, ctx) {
  const abs = path.resolve(cwd, String(target).replace(/^~(?=\/)/, os.homedir()));
  const home = os.homedir();
  for (const g of ctx.policy.governancePaths) {
    if (g.startsWith('~/')) {
      if (abs === path.join(home, g.slice(2))) return g;
      continue;
    }
    const rel = path.relative(ctx.projectDir, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (matchesAny(rel.split(path.sep).join('/'), [g])) return rel;
  }
  return null;
}

function secretsBash(cmd, ctx) {
  if (ctx.policy.gates.secrets.mode !== 'block') return null;
  const prog = base(cmd.argv[0]);
  const args = cmd.argv.slice(1);
  const markers = ctx.policy.environments.live.markers;
  const msg = (what) => block('secrets', `${what} would expose live credentials in the transcript. If a task needs the database, use a test DATABASE_URL; live access goes through the batch-approved migration gate.`);
  if (prog === 'printenv' && (args.length === 0 || args.some((a) => markers.includes(a)))) return msg(`\`printenv ${args.join(' ')}\``.replace(' `', '`'));
  if (prog === 'env' && args.length === 0) return msg('`env`');
  if ((prog === 'set' || prog === 'export') && (args.length === 0 || args.every((a) => a === '-p'))) return msg(`\`${prog}\``);
  if (PRINTERS.has(prog)) {
    const ref = new RegExp(`(\\$\\{?(${markers.join('|')})\\b|process\\.env(\\.(${markers.join('|')})\\b|\\[['"](${markers.join('|')})['"]\\])|environ[^\\n]*['"](${markers.join('|')})['"]|getenv\\(['"](${markers.join('|')})['"])`);
    if (markers.length && args.some((a) => ref.test(a))) return msg(`\`${prog}\` with a live credential reference`);
  }
  if (READERS.has(prog) && args.some((a) => ENV_FILE.test(base(a.replace(/^@/, ''))))) return msg(`\`${prog}\` on an env file`);
  return null;
}

// ------------------------------------------------------------ migration ----

function classifyUrl(url, assigns, ctx) {
  let u = String(url ?? '');
  const varRef = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(u);
  if (varRef) {
    if (assigns[varRef[1]] === undefined) return 'live';
    u = assigns[varRef[1]];
  }
  if (!u || u.includes('$')) return 'live';
  const t = ctx.policy.environments.test;
  if (ctx.policy.environments.live.dbUrlPatterns.some((p) => new RegExp(p).test(u))) return 'live';
  try {
    const parsed = new URL(u);
    const db = parsed.pathname.replace(/^\//, '');
    if (t.hosts.includes(parsed.hostname)) return 'test';
    if (db && new RegExp(t.dbNamePattern).test(db)) return 'test';
  } catch { /* not a URL */ }
  return 'live';
}

const flagValue = (argv, names) => {
  for (let i = 0; i < argv.length; i++) {
    for (const n of names) {
      if (argv[i] === n) return argv[i + 1];
      if (argv[i].startsWith(`${n}=`)) return argv[i].slice(n.length + 1);
    }
  }
  return undefined;
};

/** Returns {target:'test'|'live', what} when the command applies schema/data changes to a database. */
export function classifyMigrationCommand(cmd, ctx) {
  const prog = base(cmd.argv[0]);
  const a = cmd.argv.slice(1);
  const has = (...w) => w.every((x) => a.includes(x));
  const urlTarget = (fallback) => {
    const url = flagValue(a, ['--db-url', '--url', '--database-url', '-u']);
    if (url !== undefined) return classifyUrl(url, cmd.assigns, ctx);
    if (cmd.assigns.DATABASE_URL !== undefined) return classifyUrl(cmd.assigns.DATABASE_URL, cmd.assigns, ctx);
    return fallback;
  };
  if (prog === 'supabase') {
    const isPush = has('db', 'push'); const isReset = has('db', 'reset');
    const isUp = has('migration', 'up') || has('migration', 'repair');
    if (!isPush && !isReset && !isUp) return null;
    if (a.includes('--local')) return { target: 'test', what: `supabase ${a.slice(0, 2).join(' ')}` };
    if (a.includes('--linked')) return { target: 'live', what: `supabase ${a.slice(0, 2).join(' ')} --linked` };
    const url = flagValue(a, ['--db-url']);
    if (url !== undefined) return { target: classifyUrl(url, cmd.assigns, ctx), what: 'supabase --db-url' };
    return { target: isPush ? 'live' : 'test', what: `supabase ${a.slice(0, 2).join(' ')}` };
  }
  if (prog === 'prisma') {
    if ((a[0] === 'migrate' && ['deploy', 'reset', 'resolve', 'dev'].includes(a[1])) || (a[0] === 'db' && ['push', 'execute'].includes(a[1]))) {
      return { target: urlTarget('live'), what: `prisma ${a[0]} ${a[1]}` };
    }
    return null;
  }
  const tools = {
    'drizzle-kit': () => ['push', 'migrate'].includes(a[0]),
    knex: () => /^migrate:(latest|up|down|rollback)$/.test(a[0] ?? ''),
    sequelize: () => /^db:migrate/.test(a[0] ?? ''),
    'sequelize-cli': () => /^db:migrate/.test(a[0] ?? ''),
    'node-pg-migrate': () => ['up', 'down', 'redo'].includes(a[0]),
    dbmate: () => ['up', 'migrate', 'rollback', 'down'].includes(a[0]),
    atlas: () => (a[0] === 'migrate' && a[1] === 'apply') || (a[0] === 'schema' && a[1] === 'apply'),
    flyway: () => a.includes('migrate'),
    liquibase: () => a.includes('update'),
  };
  if (tools[prog]?.()) return { target: urlTarget('live'), what: `${prog} ${a[0] ?? ''}`.trim() };
  if (prog === 'psql') {
    const sqlArg = flagValue(a, ['-c', '--command']);
    const isFile = a.some((x) => x === '-f' || x === '--file' || x.startsWith('--file='));
    if (!isFile && !(sqlArg && WRITE_SQL.test(sqlArg))) return null;
    const conn = a.find((x) => /^(postgres(ql)?:\/\/|\$)/.test(x)) ?? flagValue(a, ['-d', '--dbname']);
    const host = flagValue(a, ['-h', '--host']) ?? cmd.assigns.PGHOST;
    let target;
    if (conn !== undefined) target = classifyUrl(conn, cmd.assigns, ctx);
    else if (host !== undefined) target = ctx.policy.environments.test.hosts.includes(host) ? 'test' : 'live';
    else target = 'test'; // local socket
    return { target, what: 'psql' };
  }
  return null;
}

function migrationBash(cmd, ctx) {
  const m = classifyMigrationCommand(cmd, ctx);
  if (!m || m.target === 'test') return null;
  const mode = ctx.policy.gates.migration.live;
  if (mode === 'allow') return null;
  if (mode === 'deny') return block('migration', `\`${m.what}\` targets the live database, and this project's policy denies agent-run live migrations. Prepare the migration and hand it to the approver.`);
  const why = liveBatchProblem(ctx);
  return why ? block('migration', `\`${m.what}\` targets the live database: ${why}`) : null;
}

function validBatches(ctx) {
  const now = ctx.env.now();
  return (safe(() => ctx.env.approvals(), []) ?? [])
    .filter((b) => b && b.target === 'live' && Array.isArray(b.migrations) && Date.parse(b.expires) > now);
}

const receipted = (ctx, target, sha) => (safe(() => ctx.env.receipts(), []) ?? []).some((r) => r.kind === 'migration' && r.target === target && r.sha256 === sha);

/** Bash migration tools apply everything pending, so every pending entry must check out. */
function liveBatchProblem(ctx) {
  const batches = validBatches(ctx);
  if (!batches.length) return 'there is no approved, unexpired live batch on the default branch. Create one with `keel batch create`, open a PR, and have the approver merge it.';
  if (!safe(() => ctx.env.migrationTreeMatchesDefault(), false)) return 'the migration files here differ from the default branch. Only reviewed, merged migrations can go to live.';
  const pending = batches.flatMap((b) => b.migrations.map((e) => ({ ...e, batch: b.batch }))).filter((e) => !receipted(ctx, 'live', e.sha256));
  if (!pending.length) return 'every migration in the approved batches has already been applied. A new change needs a new batch.';
  for (const e of pending) {
    if (safe(() => ctx.env.sha(e.file), null) !== e.sha256) return `${e.file} no longer matches the hash approved in batch ${e.batch}. Any edit after approval voids it.`;
    if (ctx.policy.gates.migration.requireTestFirst && !receipted(ctx, 'test', e.sha256)) return `${e.file} hasn't been applied to a test database yet. Apply it to test first.`;
  }
  return null;
}

// ---------------------------------------------------------------- push ----

function pushBash(cmd, cwd, ctx) {
  if (ctx.policy.gates.push.mode !== 'block') return null;
  const prog = base(cmd.argv[0]);
  const protectedB = ctx.policy.protectedBranches;
  const msg = (what) => block('push', `${what}. Agents push to feature branches and open a PR; ${protectedB.join(', ')} only changes through reviewed merges.`);
  if (prog === 'git') {
    let i = 1; let dir = cwd;
    while (i < cmd.argv.length && cmd.argv[i].startsWith('-')) {
      const f = cmd.argv[i];
      if (f === '-C') { dir = path.resolve(cwd, cmd.argv[i + 1] ?? '.'); i += 2; continue; }
      if (f === '-c') { i += 2; continue; }
      i++;
    }
    if (cmd.argv[i] !== 'push') return null;
    const rest = cmd.argv.slice(i + 1);
    const valued = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
    const pos = []; let del = false;
    for (let k = 0; k < rest.length; k++) {
      const t = rest[k];
      if (t === '--all' || t === '--mirror') return msg(`\`git push ${t}\` would update protected branches`);
      if (t === '-d' || t === '--delete') { del = true; continue; }
      if (valued.has(t)) { k++; continue; }
      if (t.startsWith('-')) continue;
      pos.push(t);
    }
    const current = () => safe(() => ctx.env.currentBranch(dir), null);
    const refspecs = pos.slice(1);
    if (!refspecs.length) {
      const b = current();
      if (b && protectedB.includes(b)) return msg(`\`git push\` from ${b} would push straight to a protected branch`);
      return null;
    }
    for (const rs of refspecs) {
      const s = rs.replace(/^\+/, '');
      let dst = del ? s : (s.includes(':') ? s.slice(s.indexOf(':') + 1) : s);
      if (dst === 'HEAD') dst = current() ?? 'HEAD';
      dst = dst.replace(/^refs\/heads\//, '');
      if (protectedB.includes(dst)) return msg(`\`git push … ${rs}\` targets ${dst}`);
    }
    return null;
  }
  if (prog === 'gh' && cmd.argv[1] === 'api') {
    const joined = cmd.argv.join(' ');
    const ref = /git\/refs\/heads\/([^\s?]+)/.exec(joined);
    const method = (flagValue(cmd.argv, ['-X', '--method']) ?? 'GET').toUpperCase();
    if (ref && method !== 'GET' && protectedB.includes(ref[1])) return msg(`\`gh api ${method} …/git/refs/heads/${ref[1]}\` rewrites a protected branch`);
  }
  if (['curl', 'wget', 'http', 'https'].includes(prog)) {
    const joined = cmd.argv.join(' ');
    const ref = /api\.github\.com\S*git\/refs\/heads\/([^\s?"']+)/.exec(joined);
    if (ref && protectedB.includes(ref[1])) return msg(`a direct GitHub API call to ${ref[1]}`);
  }
  return null;
}

// --------------------------------------------------------------- merge ----

function mergeBlock(how) {
  return block('merge', `${how} merges immediately and skips GitHub's required checks and reviews. Use auto-merge instead (\`gh pr merge --auto\`): GitHub merges once checks pass and, for HEAVY changes, the approver has reviewed.`);
}

function mergeBash(cmd, ctx) {
  const mode = ctx.policy.gates.merge.agent;
  if (mode === 'allow') return null;
  const prog = base(cmd.argv[0]);
  const a = cmd.argv.slice(1);
  if (prog === 'gh' && a[0] === 'pr' && a[1] === 'merge') {
    if (a.includes('--disable-auto')) return null;
    if (mode === 'deny') return block('merge', 'this project\'s policy does not let the agent merge PRs at all; the approver merges.');
    if (a.includes('--admin')) return block('merge', '`gh pr merge --admin` bypasses branch protection. Agents never use admin overrides.');
    if (!a.includes('--auto')) return mergeBlock('`gh pr merge` without --auto');
    return null;
  }
  if (prog === 'gh' && a[0] === 'api' && /\/pulls\/\d+\/merge\b|\/merges\b/.test(a.join(' '))) return mergeBlock('a direct merge API call');
  if (['curl', 'wget', 'http', 'https'].includes(prog) && /api\.github\.com\S*(\/pulls\/\d+\/merge\b|\/merges\b)/.test(a.join(' '))) return mergeBlock('a direct merge API call');
  return null;
}

// -------------------------------------------------------------- deploy ----

function deployBash(cmd, ctx) {
  if (ctx.policy.gates.deploy.mode !== 'approver') return null;
  const prog = base(cmd.argv[0]);
  for (const pattern of ctx.policy.gates.deploy.commands) {
    const [p0, ...rest] = pattern.split(/\s+/);
    if (prog === p0 && rest.every((t) => cmd.argv.includes(t))) {
      return block('deploy', `\`${pattern}\` deploys to production. Deploys are run by the approver; leave the change ready on a merged PR.`);
    }
  }
  return null;
}

// ----------------------------------------------------------------- MCP ----

function decideMcp(tool, input, ctx) {
  const g = ctx.policy.gates;
  if (tool === 'merge_pull_request') {
    if (g.merge.agent === 'allow') return ALLOW;
    return g.merge.agent === 'deny'
      ? block('merge', 'this project\'s policy does not let the agent merge PRs; the approver merges.')
      : mergeBlock('the GitHub merge_pull_request tool');
  }
  if (['push_files', 'create_or_update_file', 'delete_file'].includes(tool)) {
    if (g.push.mode !== 'block') return ALLOW;
    const b = input.branch;
    if (!b) return block('push', `${tool} without an explicit branch could write to the default branch. Name a feature branch.`);
    if (ctx.policy.protectedBranches.includes(String(b).replace(/^refs\/heads\//, ''))) {
      return block('push', `${tool} on ${b} writes straight to a protected branch. Write to a feature branch and open a PR.`);
    }
    return ALLOW;
  }
  if (tool === 'apply_migration' || tool === 'execute_sql') {
    const env = ctx.policy.environments;
    const pid = input.project_id ?? input.projectId ?? input.project_ref;
    const target = env.test.supabaseProjectIds.includes(pid) ? 'test' : 'live';
    if (target === 'test') return ALLOW;
    if (tool === 'execute_sql') {
      const mode = g.migration.liveSql;
      if (mode === 'allow') return ALLOW;
      if (mode === 'read-only' && isReadOnlySql(input.query ?? input.sql ?? '')) return ALLOW;
      return block('migration', `execute_sql on the live project ${pid ?? '(unknown)'} may change data. Live changes go through an approved migration batch; read-only SELECTs are allowed.`);
    }
    return applyMigrationLive(String(input.query ?? input.sql ?? ''), pid, ctx);
  }
  return ALLOW;
}

function applyMigrationLive(query, pid, ctx) {
  const mode = ctx.policy.gates.migration.live;
  if (mode === 'allow') return ALLOW;
  if (mode === 'deny') return block('migration', 'this project\'s policy denies agent-run live migrations. Prepare the migration and hand it to the approver.');
  const sha = contentSha(query);
  const where = `apply_migration on live project ${pid ?? '(unknown)'}`;
  const batches = validBatches(ctx);
  const hit = batches.map((b) => ({ b, e: b.migrations.find((m) => m.sha256 === sha) })).find((x) => x.e);
  if (!hit) return block('migration', `${where}: this SQL is not in any approved, unexpired live batch (sha256 ${sha.slice(0, 12)}…). Create a batch with \`keel batch create\` and have the approver merge it.`);
  if (receipted(ctx, 'live', sha)) return block('migration', `${where}: this migration was already applied to live.`);
  const earlier = hit.b.migrations.filter((m) => m.order < hit.e.order && !receipted(ctx, 'live', m.sha256));
  if (earlier.length) return block('migration', `${where}: apply ${earlier.map((m) => m.file).join(', ')} first — batch ${hit.b.batch} fixes the order.`);
  if (ctx.policy.gates.migration.requireTestFirst && !receipted(ctx, 'test', sha)) return block('migration', `${where}: apply it to a test project first; no test receipt exists for this SQL.`);
  return ALLOW;
}

export function isReadOnlySql(sql) {
  const s = String(sql).replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').trim().toLowerCase();
  if (!/^(select|with|explain|show|values|table)\b/.test(s)) return false;
  return !WRITE_SQL.test(s);
}

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}
