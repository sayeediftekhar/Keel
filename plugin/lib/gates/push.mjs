// Push gate: agents push to feature branches; protected branches change only
// through reviewed merges.

import path from 'node:path';
import { base } from '../shell.mjs';
import { globToRegExp } from '../glob.mjs';
import { block, flagValue, safe } from './common.mjs';
import { decideBashInner } from './bash.mjs';


const GIT_VALUED = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix', '--exec-path', '--list-cmds', '--attr-source']);

export function pushBash(cmd, cwd, ctx) {
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


const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
