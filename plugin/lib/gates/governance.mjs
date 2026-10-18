// Governance gate: agents can't change their own gates (policy, lock, hooks
// settings, CODEOWNERS, the Keel workflow), by file tool or by shell.

import path from 'node:path';
import os from 'node:os';
import { base } from '../shell.mjs';
import { matchesAny } from '../glob.mjs';
import { ALLOW, block, expandHome, safe } from './common.mjs';


export function governanceTargets(cmd) {
  const prog = base(cmd.argv[0]);
  const args = cmd.argv.slice(1);
  const nonFlags = args.filter((a) => !a.startsWith('-'));
  const optVal = (names) => {
    for (let i = 0; i < args.length; i++) {
      for (const n of names) {
        if (args[i] === n) return args[i + 1];
        if (args[i].startsWith(`${n}=`)) return args[i].slice(n.length + 1);
      }
    }
    return undefined;
  };
  const t = [...cmd.redirects];
  if (['rm', 'unlink', 'rmdir', 'truncate', 'chmod', 'chown', 'chgrp', 'touch', 'shred', 'tee', 'mkdir']
    .includes(prog)) {
    t.push(...nonFlags);
  }
  if (['cp', 'install', 'rsync', 'ln', 'mv'].includes(prog)) {
    const dir = optVal(['-t', '--target-directory']);
    const srcs = dir ? nonFlags.filter((a) => a !== dir) : nonFlags.slice(0, -1);
    const dest = dir ?? nonFlags[nonFlags.length - 1];
    if (prog === 'mv') t.push(...srcs); // moving a governed file away changes it
    if (dest !== undefined) {
      // A tree copy can carry anything, so the directory it lands in is the target.
      // A file copy lands at <dest>/<name> (or at <dest> itself when that is a
      // file), never on the directory around it: `cp notes.txt .` is not an edit
      // of the governance files that live in `.`.
      const tree = prog === 'rsync' || srcs.some((s) => s.endsWith('/'))
        || args.some((a) => a === '--recursive' || a === '--archive' || /^-[a-zA-Z]*[rRa]/.test(a));
      t.push(tree ? dest : { path: dest, exact: true }, ...srcs.map((s) => path.join(dest, base(s))));
    }
  }
  if (prog === 'dd') for (const a of args) if (a.startsWith('of=')) t.push(a.slice(3));
  if ((prog === 'sed' || prog === 'perl' || prog === 'ruby')
    && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) t.push(...nonFlags);
  if ((prog === 'awk' || prog === 'gawk')
    && args.some((a, i) => (a === '-i' && args[i + 1] === 'inplace') || a === '--include=inplace')) {
    t.push(...nonFlags.slice(1));
  }
  if (prog === 'git') {
    const sub = args[0]; const rest = args.slice(1);
    const dd = rest.indexOf('--');
    if (sub === 'rm' || sub === 'mv') t.push(...rest.filter((a) => !a.startsWith('-')));
    // Restoring files from some other commit could swap in an older, weaker policy.
    const source = sub === 'restore'
      ? (rest.find((a) => a.startsWith('--source='))?.slice(9) ?? optValFrom(rest, ['-s', '--source']))
      : sub === 'checkout' && dd > 0 ? rest.slice(0, dd).find((a) => !a.startsWith('-')) : undefined;
    if (source && !isSafeRef(source)) {
      t.push(...(dd >= 0 ? rest.slice(dd + 1) : rest.filter((a) => !a.startsWith('-') && a !== source)));
    }
    if (sub === 'reset' && rest.includes('--hard')) {
      const ref = rest.find((a) => !a.startsWith('-'));
      if (ref && !isSafeRef(ref)) t.push('.');
    }
  }
  return t;
}
const optValFrom = (args, names) => {
  const i = args.findIndex((a) => names.includes(a));
  return i >= 0 ? args[i + 1] : undefined;
};
const isSafeRef = (r) => /^(HEAD|@|origin\/[\w./-]+|@\{u(pstream)?\})$/.test(r);

export function governanceBash(cmd, cwd, ctx) {
  const targets = governanceTargets(cmd);
  if (!targets.length) return null;
  const d = governance(targets, cwd, ctx);
  return d.allow ? null : d;
}

/**
 * A target is a path string, or { path, exact } when only the path itself (not a directory holding governed files)
 * counts.
 */
export const targetPath = (t) => (typeof t === 'string' ? t : t?.path);

export function governance(targets, cwd, ctx) {
  if (ctx.policy.gates.governance.mode !== 'block') return ALLOW;
  for (const t of targets) {
    if (!targetPath(t)) continue;
    const hit = governedPath(targetPath(t), cwd, ctx, { exact: typeof t === 'object' && t.exact });
    if (hit) {
      return block('governance', `${hit} is (or contains) a Keel governance file. Agents can't change their own gates; `
        + 'the approver edits keel.policy.json and runs `keel compile`.');
    }
  }
  return ALLOW;
}

/** Is `target` a governed file, or (unless exact) a directory containing one? Symlinks resolved, case-insensitive. */
function governedPath(target, cwd, ctx, { exact = false } = {}) {
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
    if (exact) continue;
    // a directory (or the project root) that holds governed files
    const literalPrefix = g.split('*')[0].replace(/\/$/, '');
    if (rel === '' || low(literalPrefix).startsWith(`${low(rel)}/`)) return rel || '.';
  }
  return null;
}
