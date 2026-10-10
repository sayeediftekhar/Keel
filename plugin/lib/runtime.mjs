// The real environment behind ctx.env: local git and files only, never the
// network (M1-SPEC §7 "No network in hooks").
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { contentSha } from './hash.mjs';

const RECEIPTS = '.keel/receipts.jsonl';
const APPROVALS = '.keel/approvals';

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
}

/** Resolve the project root: CLAUDE_PROJECT_DIR, else the git toplevel of cwd, else cwd. */
export function projectRoot(cwd) {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  try { return git(cwd || process.cwd(), ['rev-parse', '--show-toplevel']); } catch { return cwd || process.cwd(); }
}

/** The ref that represents reviewed history: origin/<default> if present, else <default>. */
export function defaultRef(projectDir, policy) {
  const b = policy.defaultBranch;
  try { git(projectDir, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${b}`]); return `origin/${b}`; } catch { return b; }
}

export function readReceipts(projectDir) {
  const file = path.join(projectDir, RECEIPTS);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function appendReceipt(projectDir, receipt) {
  const file = path.join(projectDir, RECEIPTS);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...receipt })}\n`);
}

/** Approved batches = batch files present on the default branch (they arrived by a reviewed merge). */
export function readApprovals(projectDir, policy) {
  const ref = defaultRef(projectDir, policy);
  let names;
  try { names = git(projectDir, ['ls-tree', '--name-only', `${ref}:${APPROVALS}`]).split('\n').filter((n) => n.endsWith('.json')); }
  catch { return []; }
  const out = [];
  for (const n of names) {
    try { out.push(JSON.parse(git(projectDir, ['show', `${ref}:${APPROVALS}/${n}`]))); } catch { /* skip unreadable batch */ }
  }
  return out;
}

export function makeEnv(projectDir, policy) {
  return {
    currentBranch: (dir) => git(dir || projectDir, ['rev-parse', '--abbrev-ref', 'HEAD']),
    approvals: () => readApprovals(projectDir, policy),
    sha: (rel) => {
      const file = path.join(projectDir, rel);
      return fs.existsSync(file) ? contentSha(fs.readFileSync(file, 'utf8')) : null;
    },
    migrationTreeMatchesDefault: () => {
      const dirs = policy.migrations.dirs.filter((d) => fs.existsSync(path.join(projectDir, d)));
      if (!dirs.length) return true;
      const ref = defaultRef(projectDir, policy);
      try {
        execFileSync('git', ['-C', projectDir, 'diff', '--quiet', ref, '--', ...dirs], { stdio: 'ignore', timeout: 5000 });
      } catch { return false; }
      const untracked = git(projectDir, ['ls-files', '--others', '--exclude-standard', '--', ...dirs]);
      return untracked === '';
    },
    receipts: () => readReceipts(projectDir),
    pkgScripts: (dir) => {
      const file = path.join(dir || projectDir, 'package.json');
      try { return JSON.parse(fs.readFileSync(file, 'utf8')).scripts ?? {}; } catch { return {}; }
    },
    now: () => Date.now(),
  };
}

export function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}
