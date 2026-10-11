// Gate decisions. Pure: everything that touches git, the filesystem or the
// network comes in through ctx.env, so the decision tables in test/ can
// drive it.
//
//   decide(event, ctx) -> { allow: true } | { allow: false, gate, reason }
//
// event: a Claude Code PreToolUse payload ({ tool_name, tool_input, cwd }).
// ctx:   { policy, projectDir, env } — see lib/runtime.mjs makeEnv() for env.
//
// env.approvals() may throw NEED_REMOTE: approvals are verified against
// GitHub, which the hook fetches only when a live migration is on the table.

import path from 'node:path';
import os from 'node:os';
import { parseCommands, base } from './shell.mjs';
import { contentSha } from './hash.mjs';
import { matchesAny, globToRegExp } from './glob.mjs';

export const NEED_REMOTE = Symbol('need-remote');
const ALLOW = Object.freeze({ allow: true });
const block = (gate, reason) => ({ allow: false, gate, reason });

const ENV_FILE = /^(\.env(rc)?(\.(?!example$|sample$|template$|dist$|test$|ci$)[\w.-]+)?|\.dev\.vars)$/i;
const ENV_PROBES = ['.env', '.env.local', '.env.production', '.envrc', '.dev.vars'];
const READERS = new Set(['cat', 'less', 'more', 'head', 'tail', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'awk', 'sed', 'bat',
  'strings', 'xxd', 'od', 'hexdump', 'base64', 'nl', 'cut', 'sort', 'uniq', 'diff', 'tac', 'jq', 'yq', 'curl', 'nc',
  'tar', 'zip', '7z', 'gzip', 'bzip2', 'xz', 'openssl', 'gpg', 'vim', 'vi', 'nano', 'emacs', 'code', 'python', 'python3', 'node']);
const COPIERS = new Set(['cp', 'scp', 'rsync', 'ln', 'mv', 'install']);
const PRINTERS = new Set(['echo', 'printf', 'node', 'python', 'python3', 'ruby', 'perl', 'deno', 'bun', 'php', 'awk',
  'curl', 'wget', 'nc', 'http', 'https', 'tee', 'logger']);
const SCRIPT_RUNNERS = { npm: ['run', 'run-script'], pnpm: ['run'], yarn: ['run'], bun: ['run'] };
const NPM_BUILTIN_SCRIPTS = new Set(['test', 'start', 'stop', 'restart']);
const PM_BUILTINS = new Set(['install', 'i', 'add', 'remove', 'rm', 'update', 'up', 'exec', 'dlx', 'ci', 'init', 'create',
  'publish', 'pack', 'link', 'list', 'ls', 'outdated', 'audit', 'why', 'config', 'store', 'cache', 'import', 'help', 'x', 'run']);
const WRITE_SQL = /\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|comment\s+on|vacuum|reindex|copy|call|do|lock|refresh|security\s+label|cluster|discard|import|reassign|into|set\s+role|reset)\b/i;
const SQL_WORDS_BEFORE_PAREN = new Set(['select', 'from', 'where', 'and', 'or', 'not', 'in', 'exists', 'any', 'all', 'some', 'values',
  'over', 'filter', 'as', 'on', 'join', 'using', 'when', 'then', 'else', 'case', 'with', 'by', 'having', 'is', 'like', 'ilike',
  'between', 'distinct', 'lateral', 'recursive', 'union', 'except', 'intersect', 'array', 'row', 'cast', 'extract', 'interval', 'within']);
const READ_FUNCS = new Set(['count', 'sum', 'avg', 'min', 'max', 'coalesce', 'nullif', 'lower', 'upper', 'trim', 'ltrim', 'rtrim', 'length',
  'char_length', 'substring', 'substr', 'replace', 'concat', 'concat_ws', 'split_part', 'position', 'strpos', 'left', 'right', 'round',
  'floor', 'ceil', 'ceiling', 'abs', 'greatest', 'least', 'now', 'date_trunc', 'date_part', 'to_char', 'to_date', 'to_timestamp',
  'age', 'array_agg', 'string_agg', 'json_agg', 'jsonb_agg', 'json_build_object', 'jsonb_build_object', 'row_number', 'rank',
  'dense_rank', 'lag', 'lead', 'first_value', 'last_value', 'ntile', 'percentile_cont', 'array_length', 'unnest', 'generate_series',
  'jsonb_array_length', 'jsonb_extract_path_text', 'json_extract_path_text', 'to_json', 'to_jsonb', 'md5', 'format',
  'regexp_replace', 'regexp_matches', 'date', 'numeric', 'decimal', 'varchar', 'char', 'timestamp', 'bool_and', 'bool_or', 'stddev', 'variance']);

export function decide(event, ctx) {
  const name = event?.tool_name ?? '';
  const input = event?.tool_input ?? {};
  const cwd = event?.cwd || ctx.projectDir;

  if (name === 'Bash') return decideBash(String(input.command ?? ''), cwd, ctx);

  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(name)) {
    return governance([input.file_path ?? input.notebook_path], cwd, ctx);
  }
  if (name === 'Read' || name === 'Grep' || name === 'Glob') {
    if (ctx.policy.gates.secrets.mode !== 'block') return ALLOW;
    const target = input.file_path ?? input.path;
    const glob = input.glob ?? (name === 'Glob' ? input.pattern : null);
    if (target && ENV_FILE.test(base(target))) return secretsBlock(`reading ${base(target)}`);
    if (name === 'Grep' && glob && ENV_PROBES.some((f) => globToRegExp(base(glob)).test(f))) return secretsBlock(`searching ${glob}`);
    return ALLOW;
  }

  const mcp = /^mcp__.+__([A-Za-z0-9_]+)$/.exec(name);
  if (mcp) return decideMcp(mcp[1], input, ctx);
  return ALLOW;
}

// ---------------------------------------------------------------- Bash ----

function decideBash(command, startCwd, ctx) {
  let cwd = startCwd;
  const cmds = expandScripts(parseCommands(command), cwd, ctx, 0);
  for (const cmd of cmds) {
    const prog = base(cmd.argv[0]);
    if (prog === 'cd' || prog === 'pushd') {
      const to = cmd.argv.find((a, i) => i > 0 && !a.startsWith('-'));
      if (to && to !== '-') cwd = path.resolve(cwd, expandHome(to));
      continue;
    }
    const d = governanceBash(cmd, cwd, ctx) ?? secretsBash(cmd, ctx) ?? migrationBash(cmd, ctx)
      ?? pushBash(cmd, cwd, ctx) ?? mergeBash(cmd, ctx) ?? deployBash(cmd, ctx) ?? dynamicBash(cmd);
    if (d) return d;
  }
  return ALLOW;
}

/** `npm run db:deploy` → also inspect the script it runs; `pnpm supabase …` → the binary. */
function expandScripts(cmds, cwd, ctx, depth) {
  if (depth > 3) return cmds;
  const out = [];
  for (const cmd of cmds) {
    out.push(cmd);
    const prog = base(cmd.argv[0]);
    let scriptName = null; let binForm = null;
    if (SCRIPT_RUNNERS[prog]?.includes(cmd.argv[1])) scriptName = cmd.argv[2];
    else if (prog === 'npm' && NPM_BUILTIN_SCRIPTS.has(cmd.argv[1])) scriptName = cmd.argv[1];
    else if ((prog === 'pnpm' || prog === 'yarn' || prog === 'bun') && cmd.argv[1] && !cmd.argv[1].startsWith('-') && !PM_BUILTINS.has(cmd.argv[1])) {
      scriptName = cmd.argv[1]; binForm = cmd.argv.slice(1);
    }
    if (!scriptName) continue;
    const scripts = safe(() => ctx.env.pkgScripts(cwd), {}) ?? {};
    const body = scripts[scriptName];
    if (typeof body === 'string') {
      const inner = parseCommands(body).map((c) => ({ ...c, assigns: { ...cmd.assigns, ...c.assigns } }));
      out.push(...expandScripts(inner, cwd, ctx, depth + 1));
    } else if (binForm) {
      out.push({ ...cmd, argv: binForm }); // `pnpm supabase db push` runs the supabase binary
    }
  }
  return out;
}

const expandHome = (p) => String(p).replace(/^~(?=\/|$)/, os.homedir()).replace(/^\$\{?HOME\}?(?=\/|$)/, os.homedir());

// ---------------------------------------------------------- governance ----

function governanceTargets(cmd) {
  const prog = base(cmd.argv[0]);
  const args = cmd.argv.slice(1);
  const nonFlags = args.filter((a) => !a.startsWith('-'));
  const optVal = (names) => { for (let i = 0; i < args.length; i++) { for (const n of names) { if (args[i] === n) return args[i + 1]; if (args[i].startsWith(`${n}=`)) return args[i].slice(n.length + 1); } } return undefined; };
  const t = [...cmd.redirects];
  if (['rm', 'unlink', 'rmdir', 'truncate', 'chmod', 'chown', 'chgrp', 'touch', 'shred', 'tee', 'mkdir'].includes(prog)) t.push(...nonFlags);
  if (prog === 'mv') t.push(...nonFlags);
  if (['cp', 'install', 'rsync', 'ln', 'mv'].includes(prog)) {
    const dir = optVal(['-t', '--target-directory']);
    if (dir) t.push(dir, ...nonFlags.filter((a) => a !== dir).map((src) => path.join(dir, base(src))));
    else t.push(...nonFlags.slice(-1));
  }
  if (prog === 'dd') for (const a of args) if (a.startsWith('of=')) t.push(a.slice(3));
  if ((prog === 'sed' || prog === 'perl' || prog === 'ruby') && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) t.push(...nonFlags);
  if ((prog === 'awk' || prog === 'gawk') && args.some((a, i) => (a === '-i' && args[i + 1] === 'inplace') || a === '--include=inplace')) t.push(...nonFlags.slice(1));
  if (prog === 'git') {
    const sub = args[0]; const rest = args.slice(1);
    const dd = rest.indexOf('--');
    if (sub === 'rm' || sub === 'mv') t.push(...rest.filter((a) => !a.startsWith('-')));
    // Restoring files from some other commit could swap in an older, weaker policy.
    const source = sub === 'restore' ? (rest.find((a) => a.startsWith('--source='))?.slice(9) ?? optValFrom(rest, ['-s', '--source']))
      : sub === 'checkout' && dd > 0 ? rest.slice(0, dd).find((a) => !a.startsWith('-')) : undefined;
    if (source && !isSafeRef(source)) t.push(...(dd >= 0 ? rest.slice(dd + 1) : rest.filter((a) => !a.startsWith('-') && a !== source)));
    if (sub === 'reset' && rest.includes('--hard')) { const ref = rest.find((a) => !a.startsWith('-')); if (ref && !isSafeRef(ref)) t.push('.'); }
  }
  return t;
}
const optValFrom = (args, names) => { const i = args.findIndex((a) => names.includes(a)); return i >= 0 ? args[i + 1] : undefined; };
const isSafeRef = (r) => /^(HEAD|@|origin\/[\w./-]+|@\{u(pstream)?\})$/.test(r);

function governanceBash(cmd, cwd, ctx) {
  const targets = governanceTargets(cmd);
  if (!targets.length) return null;
  const d = governance(targets, cwd, ctx);
  return d.allow ? null : d;
}

function governance(targets, cwd, ctx) {
  if (ctx.policy.gates.governance.mode !== 'block') return ALLOW;
  for (const t of targets) {
    if (!t) continue;
    const hit = governedPath(t, cwd, ctx);
    if (hit) return block('governance', `${hit} is (or contains) a Keel governance file. Agents can't change their own gates; the approver edits keel.policy.json and runs \`keel compile\`.`);
  }
  return ALLOW;
}

/** Is `target` a governed file, or a directory containing one? Symlinks resolved, case-insensitive. */
function governedPath(target, cwd, ctx) {
  const real = (p) => safe(() => ctx.env.realpath?.(p), null) ?? p;
  const abs = real(path.resolve(cwd, expandHome(target)));
  const low = (s) => s.toLowerCase();
  const home = os.homedir();
  const projectReal = real(ctx.projectDir);
  for (const g of ctx.policy.governancePaths) {
    if (g.startsWith('~/')) {
      const gAbs = path.join(home, g.slice(2));
      if (low(abs) === low(gAbs) || low(gAbs).startsWith(`${low(abs).replace(/\/$/, '')}/`)) return g;
      continue;
    }
    const rel = path.relative(projectReal, abs).split(path.sep).join('/');
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (matchesAny(low(rel), [low(g)])) return rel;
    // a directory (or the project root) that holds governed files
    const literalPrefix = g.split('*')[0].replace(/\/$/, '');
    if (rel === '' || low(literalPrefix).startsWith(`${low(rel)}/`)) return rel || '.';
  }
  return null;
}

// ------------------------------------------------------------- secrets ----

function secretsBlock(what) {
  return block('secrets', `${what} would expose live credentials in the transcript. If a task needs the database, use a test DATABASE_URL; live access goes through the batch-approved migration gate.`);
}

function isEnvArg(a) {
  const b = base(String(a).replace(/^@/, '').replace(/^[^:]*:(?=\.)/, '')); // git show HEAD:.env → .env
  if (ENV_FILE.test(b)) return true;
  if (/[*?[]/.test(b)) return ENV_PROBES.some((f) => globToRegExp(b).test(f)); // cat .e*
  return false;
}

function secretsBash(cmd, ctx) {
  if (ctx.policy.gates.secrets.mode !== 'block') return null;
  const prog = base(cmd.argv[0]);
  const args = cmd.argv.slice(1);
  const markers = ctx.policy.environments.live.markers;
  if (prog === 'printenv' && (args.length === 0 || args.some((a) => markers.includes(a)))) return secretsBlock(`\`printenv${args.length ? ` ${args.join(' ')}` : ''}\``);
  if (prog === 'env' && args.length === 0) return secretsBlock('`env`');
  if ((prog === 'set' || prog === 'export') && (args.length === 0 || args.every((a) => a === '-p'))) return secretsBlock(`\`${prog}\``);
  if ((prog === 'declare' || prog === 'typeset') && args.length && args.every((a) => /^-[a-zA-Z]*[px]/.test(a))) return secretsBlock(`\`${prog} ${args.join(' ')}\``);
  if (prog === 'compgen' && args.includes('-e')) return secretsBlock('`compgen -e`');
  if (args.some((a) => /\/proc\/[^/]+\/environ/.test(a)) || cmd.inputs.some((a) => /\/proc\/[^/]+\/environ/.test(a))) return secretsBlock('reading a process environment');
  if (PRINTERS.has(prog) || cmd.dynamic) {
    const m = markers.join('|');
    const ref = m ? new RegExp(`(\\$\\{?(${m})\\b|process\\.env(\\.(${m})\\b|\\[['"](${m})['"]\\])|environ[^\\n]*['"](${m})['"]|getenv\\(['"](${m})['"])`) : null;
    if (ref && args.some((a) => ref.test(a))) return secretsBlock(`\`${prog}\` with a live credential reference`);
    const whole = /process\.env(?!\s*(\.\s*[A-Za-z_]|\[))|os\.environ(?!\s*(\[|\.get\b))|\bENV(?!\s*\[)\b(?=.*(puts|p |print|inspect|to_h))|%ENV|getenv\(\s*\)/;
    if (['node', 'python', 'python3', 'ruby', 'perl', 'deno', 'bun', 'php'].includes(prog) && args.some((a) => whole.test(a))) return secretsBlock(`\`${prog}\` printing the whole environment`);
  }
  if (cmd.inputs.some(isEnvArg)) return secretsBlock(`\`${prog} < env file\``);
  if (prog === 'dd' && args.some((a) => a.startsWith('if=') && isEnvArg(a.slice(3)))) return secretsBlock('`dd` on an env file');
  if (prog === 'git' && ['show', 'cat-file', 'log', 'diff', 'grep'].includes(args[0]) && args.some((a) => /:.*\.env|^\.env/.test(a) && isEnvArg(a))) return secretsBlock(`\`git ${args[0]}\` on an env file`);
  if (COPIERS.has(prog)) {
    const srcs = args.filter((a) => !a.startsWith('-')).slice(0, -1);
    if (srcs.some(isEnvArg)) return secretsBlock(`\`${prog}\` of an env file`);
  } else if (READERS.has(prog) && args.some(isEnvArg)) {
    return secretsBlock(`\`${prog}\` on an env file`);
  }
  // Recursive searches for a credential name would print the line from .env.
  if (markers.length && args.some((a) => markers.some((m) => a.includes(m)))) {
    const paths = args.filter((a) => !a.startsWith('-')).slice(1);
    const wide = paths.length === 0 || paths.some((p) => p === '.' || p === './' || isEnvArg(p));
    if ((prog === 'grep' || prog === 'egrep') && args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive') && wide) return secretsBlock('a recursive search for a credential name');
    if ((prog === 'rg' || prog === 'ag') && args.some((a) => /^(--hidden|-u+|--no-ignore|--unrestricted)$/.test(a))) return secretsBlock('a hidden-file search for a credential name');
  }
  return null;
}

// ------------------------------------------------------------ migration ----

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
  if (/^postgres(ql)?:\/\//.test(u)) {
    try {
      const parsed = new URL(u);
      const host = parsed.searchParams.get('host') ?? parsed.hostname;
      const db = parsed.searchParams.get('dbname') ?? parsed.pathname.replace(/^\//, '');
      if (t.hosts.includes(host) || host === '') return 'test';
      if (db && new RegExp(t.dbNamePattern).test(db) && host === parsed.hostname && t.hosts.includes(parsed.hostname)) return 'test';
      if (db && new RegExp(t.dbNamePattern).test(db) && !parsed.searchParams.get('host')) return 'test';
      return 'live';
    } catch { return 'live'; }
  }
  if (/[a-z]+=/.test(u)) { // libpq key=value conninfo
    const kv = Object.fromEntries([...u.matchAll(/(\w+)\s*=\s*('[^']*'|\S+)/g)].map((m) => [m[1], m[2].replace(/^'|'$/g, '')]));
    if (kv.service) return 'live';
    const host = kv.host ?? kv.hostaddr;
    if (host === undefined || t.hosts.includes(host)) return 'test';
    return 'live';
  }
  return 'live';
}

const flagValue = (argv, names) => {
  for (let i = 0; i < argv.length; i++) {
    for (const n of names) {
      if (argv[i] === n) return argv[i + 1];
      if (argv[i].startsWith(`${n}=`)) return argv[i].slice(n.length + 1);
      if (n.length === 2 && n.startsWith('-') && !n.startsWith('--') && argv[i].startsWith(n) && argv[i].length > 2) return argv[i].slice(2);
    }
  }
  return undefined;
};

/** {target:'test'|'live', what, sql?} when the command applies schema or data changes to a database. */
export function classifyMigrationCommand(cmd, ctx) {
  const prog = base(cmd.argv[0]);
  const a = cmd.argv.slice(1);
  if (a.includes('--help') || a.includes('-h') && prog !== 'psql' || a.includes('--dry-run')) return null;
  const has = (...w) => w.every((x) => a.includes(x));
  const urlTarget = () => {
    const url = flagValue(a, ['--db-url', '--url', '--database-url']);
    if (url !== undefined) return classifyUrl(url, cmd, ctx);
    const db = effective('DATABASE_URL', cmd, ctx);
    return db === undefined ? 'live' : classifyUrl(db, cmd, ctx);
  };
  if (prog === 'supabase' && has('db', 'query')) {
    // `supabase db query "<sql>"` (CLI 2.79+) runs SQL directly. Read-only SQL is fine anywhere;
    // anything else needs an explicit local/test target. Unknown target = live (fail closed).
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
  if (prog === 'supabase') {
    const isPush = has('db', 'push'); const isReset = has('db', 'reset');
    const isUp = has('migration', 'up') || has('migration', 'repair');
    if (!isPush && !isReset && !isUp) return null;
    const what = `supabase ${a.slice(0, 2).join(' ')}`;
    if (a.includes('--local')) return { target: 'test', what };
    if (a.some((x) => x === '--linked' || x.startsWith('--linked='))) return { target: 'live', what: `${what} --linked` };
    const url = flagValue(a, ['--db-url']);
    if (url !== undefined) return { target: classifyUrl(url, cmd, ctx), what };
    return { target: isPush ? 'live' : 'test', what };
  }
  if (prog === 'prisma') {
    if (!((a[0] === 'migrate' && ['deploy', 'reset', 'resolve', 'dev'].includes(a[1])) || (a[0] === 'db' && ['push', 'execute'].includes(a[1])))) return null;
    let target = urlTarget();
    // With directUrl in the schema, Prisma migrates through DIRECT_URL, not DATABASE_URL.
    if (target === 'test' && safe(() => ctx.env.prismaUsesDirectUrl?.(), true) !== false) {
      const direct = effective('DIRECT_URL', cmd, ctx);
      target = direct === undefined ? 'live' : classifyUrl(direct, cmd, ctx);
    }
    return { target, what: `prisma ${a[0]} ${a[1]}` };
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
  if (tools[prog]?.()) return { target: urlTarget(), what: `${prog} ${a[0] ?? ''}`.trim() };
  if (prog === 'psql') return classifyPsql(cmd, a, ctx);
  return null;
}

function classifyPsql(cmd, a, ctx) {
  const sql = flagValue(a, ['-c', '--command']);
  const file = flagValue(a, ['-f', '--file']);
  const stdin = cmd.inputs.length > 0 || cmd.pipedFrom || cmd.stdinText;
  const writes = file !== undefined || stdin || (sql !== undefined && (/\\(i|ir|include|copy|o)\b/.test(sql) || !isReadOnlySql(sql)));
  if (!writes) return null;
  // Connection: positional dbname/URL/conninfo, -d, -h, or the PG* environment.
  const valued = new Set(['-c', '--command', '-f', '--file', '-d', '--dbname', '-h', '--host', '-p', '--port', '-U', '--username', '-v', '--set', '-o', '--output', '-P']);
  const positional = [];
  for (let i = 0; i < a.length; i++) { if (valued.has(a[i])) { i++; continue; } if (!a[i].startsWith('-')) positional.push(a[i]); }
  const conn = flagValue(a, ['-d', '--dbname']) ?? positional[0];
  const host = flagValue(a, ['-h', '--host']) ?? effective('PGHOST', cmd, ctx);
  const t = ctx.policy.environments.test;
  let target;
  if (host !== undefined && !t.hosts.includes(host)) target = 'live';
  else if (conn !== undefined && /^(postgres(ql)?:\/\/|\$|.*=)/.test(conn)) target = classifyUrl(conn, cmd, ctx);
  else if (effective('PGSERVICE', cmd, ctx) !== undefined) target = 'live';
  else target = 'test'; // local socket or a local -h
  if (target === 'live' && sql !== undefined && file === undefined && !stdin && ctx.policy.gates.migration.liveSql === 'read-only' && isReadOnlySql(sql)) return null;
  return { target, what: 'psql' };
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
  const list = ctx.env.approvals(); // may throw NEED_REMOTE; caught by the hook, not here
  return (list ?? []).filter((b) => b && b.target === 'live' && Date.parse(b.expires) > now && Array.isArray(b.migrations) && b.migrations.length
    && b.migrations.every((m) => typeof m.file === 'string' && /^[0-9a-f]{64}$/.test(m.sha256 ?? '') && Number.isInteger(m.order)));
}

const receipted = (ctx, target, sha) => (safe(() => ctx.env.receipts(), []) ?? []).some((r) => r.kind === 'migration' && r.target === target && r.sha256 === sha);

/** Bash migration tools apply everything pending, so every pending entry must check out. */
function liveBatchProblem(ctx) {
  const batches = validBatches(ctx);
  if (!batches.length) return 'there is no approved, unexpired live batch on the default branch on GitHub. Create one with `keel batch create`, open a PR, and have the approver merge it.';
  if (!safe(() => ctx.env.migrationTreeMatchesDefault(), false)) return 'the local migration files differ from the default branch on GitHub. Only reviewed, merged migrations can go to live.';
  const pending = batches.flatMap((b) => b.migrations.map((e) => ({ ...e, batch: b.batch }))).filter((e) => !receipted(ctx, 'live', e.sha256));
  if (!pending.length) return 'every migration in the approved batches has already been applied. A new change needs a new batch.';
  for (const e of pending) {
    if (safe(() => ctx.env.sha(e.file), null) !== e.sha256) return `${e.file} no longer matches the hash approved in batch ${e.batch}. Any edit after approval voids it.`;
    if (ctx.policy.gates.migration.requireTestFirst && !receipted(ctx, 'test', e.sha256)) return `${e.file} hasn't been applied to a test database yet. Apply it to test first.`;
  }
  return null;
}

// ---------------------------------------------------------------- push ----

const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--exec-path', '--list-cmds', '--attr-source']);

function pushBash(cmd, cwd, ctx) {
  if (ctx.policy.gates.push.mode !== 'block') return null;
  const prog = base(cmd.argv[0]);
  const protectedB = ctx.policy.protectedBranches;
  const msg = (what) => block('push', `${what}. Agents push to feature branches and open a PR; ${protectedB.join(', ')} only changes through reviewed merges.`);
  if (prog === 'git') {
    let i = 1; let dir = cwd; const configs = [];
    while (i < cmd.argv.length && cmd.argv[i].startsWith('-')) {
      const f = cmd.argv[i];
      if (f === '-C') { dir = path.resolve(dir, cmd.argv[i + 1] ?? '.'); i += 2; continue; }
      if (f === '-c') { configs.push(cmd.argv[i + 1] ?? ''); i += 2; continue; }
      if (GIT_VALUED.has(f)) { i += 2; continue; }
      i++;
    }
    let sub = cmd.argv[i]; let rest = cmd.argv.slice(i + 1);
    // -c alias.x=push … / -c alias.x='!git push …'
    const alias = configs.find((c) => c.toLowerCase().startsWith(`alias.${String(sub).toLowerCase()}=`));
    if (alias) {
      const val = alias.slice(alias.indexOf('=') + 1).trim();
      if (val.startsWith('!')) return decideBashInner(val.slice(1), dir, ctx);
      const words = val.split(/\s+/); sub = words[0]; rest = [...words.slice(1), ...rest];
    }
    if (sub === 'config' && rest.some((a) => /^remote\..*\.push$/i.test(a) || /^alias\./i.test(a))) {
      const val = rest.filter((a) => !a.startsWith('-')).slice(1).join(' ');
      if (/push|merge/.test(val) || /^remote\..*\.push$/i.test(rest.find((a) => !a.startsWith('-')) ?? '')) return msg('setting a push refspec or a git alias that pushes');
    }
    if (sub !== 'push') return null;
    const valued = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
    const pos = []; let del = false;
    for (let k = 0; k < rest.length; k++) {
      const t = rest[k];
      if (t === '--all' || t === '--mirror' || t === '--branches') return msg(`\`git push ${t}\` would update protected branches`);
      if (t === '-d' || t === '--delete') { del = true; continue; }
      if (valued.has(t)) { k++; continue; }
      if (t.startsWith('-')) continue;
      pos.push(t);
    }
    const current = () => safe(() => ctx.env.currentBranch(dir), null);
    const remote = pos[0] ?? 'origin';
    let refspecs = pos.slice(1);
    if (!refspecs.length) {
      const fromC = configs.filter((c) => new RegExp(`^remote\\.${escapeRe(remote)}\\.push=`, 'i').test(c)).map((c) => c.slice(c.indexOf('=') + 1));
      const fromConfig = safe(() => ctx.env.gitConfig?.(dir, `remote.${remote}.push`), []) ?? [];
      refspecs = [...fromC, ...fromConfig];
    }
    if (!refspecs.length) {
      const b = current();
      if (b && protectedB.includes(b)) return msg(`\`git push\` from ${b} would push straight to a protected branch`);
      return null;
    }
    for (const rs of refspecs) {
      const s = rs.replace(/^\+/, '');
      let dst = del ? s : (s.includes(':') ? s.slice(s.indexOf(':') + 1) : s);
      if (dst === 'HEAD' || dst === '@') dst = current() ?? 'HEAD';
      dst = dst.replace(/^refs\/heads\//, '').replace(/^heads\//, '');
      if (dst.includes('*')) {
        const re = globToRegExp(dst.replace(/\*/g, '**'));
        const hit = protectedB.find((b) => re.test(b));
        if (hit) return msg(`\`git push … ${rs}\` matches ${hit}`);
      } else if (protectedB.includes(dst)) return msg(`\`git push … ${rs}\` targets ${dst}`);
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
    const ref = /api\.github\.com\S*git\/refs\/heads\/([^\s?"']+)/.exec(cmd.argv.join(' '));
    if (ref && protectedB.includes(ref[1])) return msg(`a direct GitHub API call to ${ref[1]}`);
  }
  return null;
}

function decideBashInner(script, cwd, ctx) {
  const d = decideBash(script, cwd, ctx);
  return d.allow ? null : d;
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    if (a.includes('--disable-auto') && !a.includes('--admin')) return null;
    if (mode === 'deny') return block('merge', 'this project\'s policy does not let the agent merge PRs at all; the approver merges.');
    if (a.includes('--admin')) return block('merge', '`gh pr merge --admin` bypasses branch protection. Agents never use admin overrides.');
    const auto = a.some((x) => x === '--auto' || x === '--auto=true');
    if (!auto) return mergeBlock('`gh pr merge` without --auto');
    return null;
  }
  if (prog === 'gh' && a[0] === 'alias' && a[1] === 'set' && /pr\s+merge|merge_pull|\bpush\b/.test(a.slice(2).join(' '))) {
    return block('merge', 'a gh alias that wraps `pr merge` or `push` would hide the action from the gate. Use the commands directly.');
  }
  if (prog === 'gh' && a[0] === 'api') {
    const joined = a.join(' ');
    if (/\/pulls\/\d+\/merge\b|\/merges\b/.test(joined)) return mergeBlock('a direct merge API call');
    if (/mergePullRequest|mergeBranch/.test(joined)) return mergeBlock('a GraphQL merge mutation');
  }
  if (['curl', 'wget', 'http', 'https'].includes(prog) && /api\.github\.com\S*(\/pulls\/\d+\/merge\b|\/merges\b|graphql)/.test(a.join(' ')) && /merge/i.test(a.join(' '))) return mergeBlock('a direct merge API call');
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

/** A command whose program name is computed at run time can't be checked; block it when it looks risky. */
function dynamicBash(cmd) {
  if (!cmd.dynamic) return null;
  const rest = cmd.argv.slice(1).join(' ');
  const kind = /\bmerge\b/.test(rest) ? 'merge' : /\bpush\b/.test(rest) ? 'push' : /\b(migrate|db)\b/.test(rest) ? 'migration' : /--prod|\bdeploy\b/.test(rest) ? 'deploy' : null;
  return kind ? block(kind, `\`${cmd.argv[0]} ${rest}\` computes its program name at run time, so Keel can't check it. Run the command directly.`) : null;
}

// ----------------------------------------------------------------- MCP ----

function decideMcp(tool, input, ctx) {
  const g = ctx.policy.gates;
  const env = ctx.policy.environments;
  const pid = input.project_id ?? input.projectId ?? input.project_ref;
  const isTestProject = env.test.supabaseProjectIds.includes(pid);
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
  if (tool === 'merge_branch') {
    if (g.migration.live === 'allow') return ALLOW;
    return block('migration', 'merge_branch applies a development branch\'s migrations to production. The approver merges branches; agents ship schema changes as approved migration batches.');
  }
  if (tool === 'deploy_edge_function') {
    if (g.deploy.mode !== 'approver' || isTestProject) return ALLOW;
    return block('deploy', `deploying an edge function to ${pid ?? 'a live project'} is a production deploy. The approver deploys.`);
  }
  if (tool === 'actions_run_trigger' && g.deploy.mode === 'approver') {
    const wf = String(input.workflow_id ?? input.workflow ?? '');
    if (/deploy|release|prod|publish/i.test(wf)) return block('deploy', `triggering ${wf} looks like a production deploy. The approver runs deploy workflows.`);
    return ALLOW;
  }
  if (tool === 'apply_migration' || tool === 'execute_sql') {
    if (isTestProject) return ALLOW;
    if (tool === 'execute_sql') {
      const mode = g.migration.liveSql;
      if (mode === 'allow') return ALLOW;
      if (mode === 'read-only' && isReadOnlySql(input.query ?? input.sql ?? '')) return ALLOW;
      return block('migration', `execute_sql on the live project ${pid ?? '(unknown)'} may change data. Live changes go through an approved migration batch; plain read-only SELECTs are allowed.`);
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
  if (!hit) return block('migration', `${where}: this SQL is not in any approved, unexpired live batch on GitHub (sha256 ${sha.slice(0, 12)}…). Create a batch with \`keel batch create\` and have the approver merge it.`);
  if (receipted(ctx, 'live', sha)) return block('migration', `${where}: this migration was already applied to live.`);
  const earlier = hit.b.migrations.filter((m) => m.order < hit.e.order && !receipted(ctx, 'live', m.sha256));
  if (earlier.length) return block('migration', `${where}: apply ${earlier.map((m) => m.file).join(', ')} first — batch ${hit.b.batch} fixes the order.`);
  if (ctx.policy.gates.migration.requireTestFirst && !receipted(ctx, 'test', sha)) return block('migration', `${where}: apply it to a test project first; no test receipt exists for this SQL.`);
  return ALLOW;
}

/** Conservative: true only for a single plain query that can't change anything. */
export function isReadOnlySql(sql) {
  let s = String(sql).replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''").replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, 'ident').trim().toLowerCase();
  s = s.replace(/;\s*$/, '');
  if (s.includes(';')) return false; // one statement only
  if (!/^(select|with|explain|show|values|table)\b/.test(s)) return false;
  if (/^explain\b[^;]*\banalyze\b/.test(s)) return false; // EXPLAIN ANALYZE executes the statement
  if (WRITE_SQL.test(s)) return false;
  for (const m of s.matchAll(/([a-z_][a-z0-9_.]*)\s*\(/g)) {
    const fn = m[1];
    if (!SQL_WORDS_BEFORE_PAREN.has(fn) && !READ_FUNCS.has(fn)) return false;
  }
  return true;
}

function safe(fn, fallback) {
  try { return fn(); } catch (e) { if (e === NEED_REMOTE) throw e; return fallback; }
}
