// Push gate: agents push to feature branches; protected branches change only
// through reviewed merges.

import path from 'node:path';
import { base } from '../shell.mjs';
import { globToRegExp } from '../glob.mjs';
import { block, flagValue, safe } from './common.mjs';
import { decideBashInner } from './bash.mjs';


const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix',
  '--exec-path', '--list-cmds', '--attr-source']);
const PUSH_VALUED = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);

/** git's global options: the -C directory, the -c configs, and the index of the subcommand. */
function gitGlobals(argv, cwd) {
  let i = 1; let dir = cwd; const configs = [];
  while (i < argv.length && argv[i].startsWith('-')) {
    const f = argv[i];
    if (f === '-C') { dir = path.resolve(dir, argv[i + 1] ?? '.'); i += 2; continue; }
    if (f === '-c') { configs.push(argv[i + 1] ?? ''); i += 2; continue; }
    if (GIT_VALUED.has(f)) { i += 2; continue; }
    i++;
  }
  return { i, dir, configs };
}

/** -c alias.x=push … / -c alias.x='!git push …': what an inline alias expands to. */
function expandAlias(configs, sub, rest) {
  const alias = configs.find((c) => c.toLowerCase().startsWith(`alias.${String(sub).toLowerCase()}=`));
  if (!alias) return { sub, rest };
  const val = alias.slice(alias.indexOf('=') + 1).trim();
  if (val.startsWith('!')) return { shell: val.slice(1) };
  const words = val.split(/\s+/);
  return { sub: words[0], rest: [...words.slice(1), ...rest] };
}

/** `git config` setting a push refspec, or an alias that pushes or merges. */
function configPushes(sub, rest) {
  if (sub !== 'config' || !rest.some((a) => /^remote\..*\.push$/i.test(a) || /^alias\./i.test(a))) return false;
  const val = rest.filter((a) => !a.startsWith('-')).slice(1).join(' ');
  return /push|merge/.test(val) || /^remote\..*\.push$/i.test(rest.find((a) => !a.startsWith('-')) ?? '');
}

/** `git push` args: positionals and --delete, or the first flag that pushes every branch. */
function pushArgs(rest) {
  const pos = []; let del = false;
  for (let k = 0; k < rest.length; k++) {
    const t = rest[k];
    if (t === '--all' || t === '--mirror' || t === '--branches') return { every: t };
    if (t === '-d' || t === '--delete') { del = true; continue; }
    if (PUSH_VALUED.has(t)) { k++; continue; }
    if (t.startsWith('-')) continue;
    pos.push(t);
  }
  return { pos, del };
}

/** The refspecs a push names, else the remote's configured push refspecs. */
function pushRefspecs(pos, configs, dir, ctx) {
  const remote = pos[0] ?? 'origin';
  const named = pos.slice(1);
  if (named.length) return named;
  const fromC = configs.filter((c) => new RegExp(`^remote\\.${escapeRe(remote)}\\.push=`, 'i').test(c))
    .map((c) => c.slice(c.indexOf('=') + 1));
  const fromConfig = safe(() => ctx.env.gitConfig?.(dir, `remote.${remote}.push`), []) ?? [];
  return [...fromC, ...fromConfig];
}

/** The first refspec whose destination is a protected branch, as a block; null if none is. */
function refspecBlock(refspecs, del, current, protectedB, msg) {
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

/** A `git …` command: blocks a push, or a push-setting config, that would reach a protected branch. */
function gitPushBlock(cmd, cwd, ctx, protectedB, msg) {
  const { i, dir, configs } = gitGlobals(cmd.argv, cwd);
  const expanded = expandAlias(configs, cmd.argv[i], cmd.argv.slice(i + 1));
  if ('shell' in expanded) return decideBashInner(expanded.shell, dir, ctx);
  const { sub, rest } = expanded;
  if (configPushes(sub, rest)) return msg('setting a push refspec or a git alias that pushes');
  if (sub !== 'push') return null;
  const args = pushArgs(rest);
  if (args.every) return msg(`\`git push ${args.every}\` would update protected branches`);
  const current = () => safe(() => ctx.env.currentBranch(dir), null);
  const refspecs = pushRefspecs(args.pos, configs, dir, ctx);
  if (!refspecs.length) {
    const b = current();
    if (b && protectedB.includes(b)) return msg(`\`git push\` from ${b} would push straight to a protected branch`);
    return null;
  }
  return refspecBlock(refspecs, args.del, current, protectedB, msg);
}

/** `gh api` or a raw HTTP client rewriting a protected branch ref through the GitHub API. */
function apiRefBlock(cmd, prog, protectedB, msg) {
  if (prog === 'gh' && cmd.argv[1] === 'api') {
    const joined = cmd.argv.join(' ');
    const ref = /git\/refs\/heads\/([^\s?]+)/.exec(joined);
    const method = (flagValue(cmd.argv, ['-X', '--method']) ?? 'GET').toUpperCase();
    if (ref && method !== 'GET' && protectedB.includes(ref[1])) {
      return msg(`\`gh api ${method} …/git/refs/heads/${ref[1]}\` rewrites a protected branch`);
    }
  }
  if (['curl', 'wget', 'http', 'https'].includes(prog)) {
    const ref = /api\.github\.com\S*git\/refs\/heads\/([^\s?"']+)/.exec(cmd.argv.join(' '));
    if (ref && protectedB.includes(ref[1])) return msg(`a direct GitHub API call to ${ref[1]}`);
  }
  return null;
}

export function pushBash(cmd, cwd, ctx) {
  if (ctx.policy.gates.push.mode !== 'block') return null;
  const prog = base(cmd.argv[0]);
  const protectedB = ctx.policy.protectedBranches;
  const msg = (what) => block('push', `${what}. Agents push to feature branches and open a PR; `
    + `${protectedB.join(', ')} only changes through reviewed merges.`);
  if (prog === 'git') return gitPushBlock(cmd, cwd, ctx, protectedB, msg);
  return apiRefBlock(cmd, prog, protectedB, msg);
}


const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
