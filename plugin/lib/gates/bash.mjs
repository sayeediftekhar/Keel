// Bash dispatch: parse the command line, follow cd and package scripts, and
// ask each gate about every simple command in turn. The first block wins.

import path from 'node:path';
import { parseCommands, base } from '../shell.mjs';
import { ALLOW, block, expandHome, safe } from './common.mjs';
import { governanceBash } from './governance.mjs';
import { ledgerBash } from './ledger.mjs';
import { secretsBash } from './secrets.mjs';
import { migrationBash } from './migration.mjs';
import { pushBash } from './push.mjs';
import { mergeBash } from './merge.mjs';
import { deployBash } from './deploy.mjs';

const SCRIPT_RUNNERS = { npm: ['run', 'run-script'], pnpm: ['run'], yarn: ['run'], bun: ['run'] };
const NPM_BUILTIN_SCRIPTS = new Set(['test', 'start', 'stop', 'restart']);
const PM_BUILTINS = new Set(['install', 'i', 'add', 'remove', 'rm', 'update', 'up', 'exec', 'dlx', 'ci', 'init',
  'create', 'publish', 'pack', 'link', 'list', 'ls', 'outdated', 'audit', 'why', 'config', 'store', 'cache', 'import',
  'help', 'x', 'run']);


export function decideBash(command, startCwd, ctx) {
  let cwd = startCwd;
  const cmds = expandScripts(parseCommands(command), cwd, ctx, 0);
  for (const cmd of cmds) {
    const prog = base(cmd.argv[0]);
    if (prog === 'cd' || prog === 'pushd') {
      const to = cmd.argv.find((a, i) => i > 0 && !a.startsWith('-'));
      if (to && to !== '-') cwd = path.resolve(cwd, expandHome(to));
      continue;
    }
    const d = governanceBash(cmd, cwd, ctx) ?? ledgerBash(cmd, cwd, ctx) ?? secretsBash(cmd, ctx)
      ?? migrationBash(cmd, ctx) ?? pushBash(cmd, cwd, ctx) ?? mergeBash(cmd, ctx) ?? deployBash(cmd, ctx)
      ?? dynamicBash(cmd);
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
    const { scriptName, binForm } = scriptInvocation(cmd);
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

/** The package script a runner command names, and its argv as a bare binary when it may be one instead. */
function scriptInvocation(cmd) {
  const prog = base(cmd.argv[0]);
  if (SCRIPT_RUNNERS[prog]?.includes(cmd.argv[1])) return { scriptName: cmd.argv[2], binForm: null };
  if (prog === 'npm' && NPM_BUILTIN_SCRIPTS.has(cmd.argv[1])) return { scriptName: cmd.argv[1], binForm: null };
  if ((prog === 'pnpm' || prog === 'yarn' || prog === 'bun') && cmd.argv[1] && !cmd.argv[1].startsWith('-')
    && !PM_BUILTINS.has(cmd.argv[1])) {
    return { scriptName: cmd.argv[1], binForm: cmd.argv.slice(1) };
  }
  return { scriptName: null, binForm: null };
}


export function decideBashInner(script, cwd, ctx) {
  const d = decideBash(script, cwd, ctx);
  return d.allow ? null : d;
}

/** A command whose program name is computed at run time can't be checked; block it when it looks risky. */
function dynamicBash(cmd) {
  if (!cmd.dynamic) return null;
  const rest = cmd.argv.slice(1).join(' ');
  const kind = /\bmerge\b/.test(rest) ? 'merge'
    : /\bpush\b/.test(rest) ? 'push'
    : /\b(migrate|db)\b/.test(rest) ? 'migration'
    : /--prod|\bdeploy\b/.test(rest) ? 'deploy'
    : null;
  return kind
    ? block(kind, `\`${cmd.argv[0]} ${rest}\` computes its program name at run time, so Keel can't check it. `
      + 'Run the command directly.')
    : null;
}
