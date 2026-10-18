// Migration gate: schema and data changes reach a live database only inside
// an approved, unexpired batch on GitHub, in order, after a test receipt.

import { base } from '../shell.mjs';
import { contentSha } from '../hash.mjs';
import { ALLOW, block, flagValue, safe } from './common.mjs';
import { isReadOnlySql } from './sql.mjs';


function effective(name, cmd, ctx) {
  if (cmd.assigns[name] !== undefined) return cmd.assigns[name];
  return safe(() => ctx.env.envVar?.(name), undefined);
}

function classifyUrl(url, cmd, ctx) {
  let u = String(url ?? '');
  const varRef = /^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/.exec(u);
  if (varRef) { u = effective(varRef[1], cmd, ctx); if (u === undefined) return 'live'; }
  if (!u || u.includes('$')) return 'live';
  if (ctx.policy.environments.live.dbUrlPatterns.some((p) => new RegExp(p).test(u))) return 'live';
  const t = ctx.policy.environments.test;
  if (/^postgres(ql)?:\/\//.test(u)) return classifyPostgresUrl(u, t);
  if (/[a-z]+=/.test(u)) return classifyConninfo(u, t); // libpq key=value conninfo
  return 'live';
}

/** A postgres:// URL is test on a test host, or a test-named db that no ?host= redirects. */
function classifyPostgresUrl(u, t) {
  try {
    const parsed = new URL(u);
    const host = parsed.searchParams.get('host') ?? parsed.hostname;
    const db = parsed.searchParams.get('dbname') ?? parsed.pathname.replace(/^\//, '');
    if (t.hosts.includes(host) || host === '') return 'test';
    if (db && new RegExp(t.dbNamePattern).test(db) && host === parsed.hostname
      && t.hosts.includes(parsed.hostname)) return 'test';
    if (db && new RegExp(t.dbNamePattern).test(db) && !parsed.searchParams.get('host')) return 'test';
    return 'live';
  } catch { return 'live'; }
}

/** A libpq key=value conninfo is test only with no service and a missing or test host. */
function classifyConninfo(u, t) {
  const kv = Object.fromEntries([...u.matchAll(/(\w+)\s*=\s*('[^']*'|\S+)/g)]
    .map((m) => [m[1], m[2].replace(/^'|'$/g, '')]));
  if (kv.service) return 'live';
  const host = kv.host ?? kv.hostaddr;
  if (host === undefined || t.hosts.includes(host)) return 'test';
  return 'live';
}

/** Target named by --db-url/--url/--database-url, else by DATABASE_URL; neither = live. */
function urlTarget(cmd, a, ctx) {
  const url = flagValue(a, ['--db-url', '--url', '--database-url']);
  if (url !== undefined) return classifyUrl(url, cmd, ctx);
  const db = effective('DATABASE_URL', cmd, ctx);
  return db === undefined ? 'live' : classifyUrl(db, cmd, ctx);
}

const hasAll = (a, ...w) => w.every((x) => a.includes(x));

// Migration tools whose target comes from urlTarget: does argv `a` apply changes? A Map, so a program
// named like an Object.prototype member (`toString`, `__proto__`) is not a tool.
const MIGRATION_TOOLS = new Map([
  ['drizzle-kit', (a) => ['push', 'migrate'].includes(a[0])],
  ['knex', (a) => /^migrate:(latest|up|down|rollback)$/.test(a[0] ?? '')],
  ['sequelize', (a) => /^db:migrate/.test(a[0] ?? '')],
  ['sequelize-cli', (a) => /^db:migrate/.test(a[0] ?? '')],
  ['node-pg-migrate', (a) => ['up', 'down', 'redo'].includes(a[0])],
  ['dbmate', (a) => ['up', 'migrate', 'rollback', 'down'].includes(a[0])],
  ['atlas', (a) => (a[0] === 'migrate' && a[1] === 'apply') || (a[0] === 'schema' && a[1] === 'apply')],
  ['flyway', (a) => a.includes('migrate')],
  ['liquibase', (a) => a.includes('update')],
]);

/** True when `prog` is a migration tool (target from urlTarget) and argv `a` applies changes. */
function isToolMigration(prog, a) {
  return MIGRATION_TOOLS.get(prog)?.(a);
}

/** {target:'test'|'live', what, sql?} when the command applies schema or data changes to a database. */
export function classifyMigrationCommand(cmd, ctx) {
  const prog = base(cmd.argv[0]);
  const a = cmd.argv.slice(1);
  if (a.includes('--help') || a.includes('-h') && prog !== 'psql' || a.includes('--dry-run')) return null;
  if (prog === 'supabase' && hasAll(a, 'db', 'query')) return classifySupabaseQuery(cmd, a, ctx);
  if (prog === 'supabase') return classifySupabase(cmd, a, ctx);
  if (prog === 'prisma') return classifyPrisma(cmd, a, ctx);
  if (isToolMigration(prog, a)) return { target: urlTarget(cmd, a, ctx), what: `${prog} ${a[0] ?? ''}`.trim() };
  if (prog === 'psql') return classifyPsql(cmd, a, ctx);
  return null;
}

/**
 * `supabase db query "<sql>"` (CLI 2.79+) runs SQL directly. Read-only SQL is fine anywhere;
 * anything else needs an explicit local/test target. Unknown target = live (fail closed).
 */
function classifySupabaseQuery(cmd, a, ctx) {
  const qi = a.indexOf('query');
  const file = flagValue(a, ['-f', '--file']);
  const sql = a.slice(qi + 1).find((x) => !x.startsWith('-') && x !== file);
  if (file === undefined && sql !== undefined && isReadOnlySql(sql)) return null;
  const what = 'supabase db query';
  if (a.includes('--local')) return { target: 'test', what };
  const url = flagValue(a, ['--db-url']);
  if (url !== undefined) return { target: classifyUrl(url, cmd, ctx), what };
  return { target: 'live', what: `${what} (add --local for the local database)` };
}

/** `supabase db push|reset`, `supabase migration up|repair`: push defaults to live, the rest to local. */
function classifySupabase(cmd, a, ctx) {
  const isPush = hasAll(a, 'db', 'push'); const isReset = hasAll(a, 'db', 'reset');
  const isUp = hasAll(a, 'migration', 'up') || hasAll(a, 'migration', 'repair');
  if (!isPush && !isReset && !isUp) return null;
  const what = `supabase ${a.slice(0, 2).join(' ')}`;
  if (a.includes('--local')) return { target: 'test', what };
  if (a.some((x) => x === '--linked' || x.startsWith('--linked='))) {
    return { target: 'live', what: `${what} --linked` };
  }
  const url = flagValue(a, ['--db-url']);
  if (url !== undefined) return { target: classifyUrl(url, cmd, ctx), what };
  return { target: isPush ? 'live' : 'test', what };
}

function classifyPrisma(cmd, a, ctx) {
  if (!((a[0] === 'migrate' && ['deploy', 'reset', 'resolve', 'dev'].includes(a[1]))
    || (a[0] === 'db' && ['push', 'execute'].includes(a[1])))) return null;
  let target = urlTarget(cmd, a, ctx);
  // With directUrl in the schema, Prisma migrates through DIRECT_URL, not DATABASE_URL.
  if (target === 'test' && safe(() => ctx.env.prismaUsesDirectUrl?.(), true) !== false) {
    const direct = effective('DIRECT_URL', cmd, ctx);
    target = direct === undefined ? 'live' : classifyUrl(direct, cmd, ctx);
  }
  return { target, what: `prisma ${a[0]} ${a[1]}` };
}

function classifyPsql(cmd, a, ctx) {
  const sql = flagValue(a, ['-c', '--command']);
  const file = flagValue(a, ['-f', '--file']);
  const stdin = cmd.inputs.length > 0 || cmd.pipedFrom || cmd.stdinText;
  const writes = file !== undefined || stdin
    || (sql !== undefined && (/\\(i|ir|include|copy|o)\b/.test(sql) || !isReadOnlySql(sql)));
  if (!writes) return null;
  const target = psqlTarget(cmd, a, ctx);
  if (target === 'live' && sql !== undefined && file === undefined && !stdin
    && ctx.policy.gates.migration.liveSql === 'read-only' && isReadOnlySql(sql)) return null;
  return { target, what: 'psql' };
}

const PSQL_VALUED = new Set(['-c', '--command', '-f', '--file', '-d', '--dbname', '-h', '--host', '-p', '--port',
  '-U', '--username', '-v', '--set', '-o', '--output', '-P']);

/** Connection: positional dbname/URL/conninfo, -d, -h, or the PG* environment. */
function psqlTarget(cmd, a, ctx) {
  const positional = [];
  for (let i = 0; i < a.length; i++) {
    if (PSQL_VALUED.has(a[i])) { i++; continue; }
    if (!a[i].startsWith('-')) positional.push(a[i]);
  }
  const conn = flagValue(a, ['-d', '--dbname']) ?? positional[0];
  const host = flagValue(a, ['-h', '--host']) ?? effective('PGHOST', cmd, ctx);
  const t = ctx.policy.environments.test;
  if (host !== undefined && !t.hosts.includes(host)) return 'live';
  if (conn !== undefined && /^(postgres(ql)?:\/\/|\$|.*=)/.test(conn)) return classifyUrl(conn, cmd, ctx);
  if (effective('PGSERVICE', cmd, ctx) !== undefined) return 'live';
  return 'test'; // local socket or a local -h
}

export function migrationBash(cmd, ctx) {
  const m = classifyMigrationCommand(cmd, ctx);
  if (!m || m.target === 'test') return null;
  const mode = ctx.policy.gates.migration.live;
  if (mode === 'allow') return null;
  if (mode === 'deny') {
    return block('migration', `\`${m.what}\` targets the live database, and this project's policy denies `
      + 'agent-run live migrations. Prepare the migration and hand it to the approver.');
  }
  const why = liveBatchProblem(ctx);
  return why ? block('migration', `\`${m.what}\` targets the live database: ${why}`) : null;
}

export function validBatches(ctx) {
  const now = ctx.env.now();
  const list = ctx.env.approvals(); // may throw NEED_REMOTE; caught by the hook, not here
  return (list ?? []).filter((b) => b && b.target === 'live' && Date.parse(b.expires) > now
    && Array.isArray(b.migrations) && b.migrations.length
    && b.migrations.every((m) => typeof m.file === 'string' && /^[0-9a-f]{64}$/.test(m.sha256 ?? '')
      && Number.isInteger(m.order)));
}

export const receipted = (ctx, target, sha) => (safe(() => ctx.env.receipts(), []) ?? [])
  .some((r) => r.kind === 'migration' && r.target === target && r.sha256 === sha);

/** Bash migration tools apply everything pending, so every pending entry must check out. */
function liveBatchProblem(ctx) {
  const batches = validBatches(ctx);
  if (!batches.length) {
    return 'there is no approved, unexpired live batch on the default branch on GitHub. '
      + 'Create one with `keel batch create`, open a PR, and have the approver merge it.';
  }
  if (!safe(() => ctx.env.migrationTreeMatchesDefault(), false)) {
    return 'the local migration files differ from the default branch on GitHub. '
      + 'Only reviewed, merged migrations can go to live.';
  }
  const pending = batches.flatMap((b) => b.migrations.map((e) => ({ ...e, batch: b.batch })))
    .filter((e) => !receipted(ctx, 'live', e.sha256));
  if (!pending.length) {
    return 'every migration in the approved batches has already been applied. A new change needs a new batch.';
  }
  for (const e of pending) {
    if (safe(() => ctx.env.sha(e.file), null) !== e.sha256) {
      return `${e.file} no longer matches the hash approved in batch ${e.batch}. Any edit after approval voids it.`;
    }
    if (ctx.policy.gates.migration.requireTestFirst && !receipted(ctx, 'test', e.sha256)) {
      return `${e.file} hasn't been applied to a test database yet. Apply it to test first.`;
    }
  }
  return null;
}

export function applyMigrationLive(query, pid, ctx) {
  const mode = ctx.policy.gates.migration.live;
  if (mode === 'allow') return ALLOW;
  if (mode === 'deny') {
    return block('migration', 'this project\'s policy denies agent-run live migrations. '
      + 'Prepare the migration and hand it to the approver.');
  }
  const sha = contentSha(query);
  const where = `apply_migration on live project ${pid ?? '(unknown)'}`;
  const batches = validBatches(ctx);
  const hit = batches.map((b) => ({ b, e: b.migrations.find((m) => m.sha256 === sha) })).find((x) => x.e);
  if (!hit) {
    return block('migration', `${where}: this SQL is not in any approved, unexpired live batch on GitHub `
      + `(sha256 ${sha.slice(0, 12)}…). Create a batch with \`keel batch create\` and have the approver merge it.`);
  }
  if (receipted(ctx, 'live', sha)) return block('migration', `${where}: this migration was already applied to live.`);
  const earlier = hit.b.migrations.filter((m) => m.order < hit.e.order && !receipted(ctx, 'live', m.sha256));
  if (earlier.length) {
    return block('migration',
      `${where}: apply ${earlier.map((m) => m.file).join(', ')} first — batch ${hit.b.batch} fixes the order.`);
  }
  if (ctx.policy.gates.migration.requireTestFirst && !receipted(ctx, 'test', sha)) {
    return block('migration', `${where}: apply it to a test project first; no test receipt exists for this SQL.`);
  }
  return ALLOW;
}
