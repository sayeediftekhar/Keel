// The real environment behind ctx.env.
//
// Local git and files for everything, except one thing: live-migration
// approvals are read from GitHub over TLS (the default branch, as GitHub
// serves it). A local ref is something the agent can rewrite; GitHub's copy
// only changes through a reviewed merge. If GitHub can't be reached, the
// live migration is blocked (fail closed).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { contentSha } from './hash.mjs';
import { NEED_REMOTE } from './gates.mjs';

const RECEIPTS = '.keel/receipts.jsonl';
const APPROVALS = '.keel/approvals/';

function git(dir, args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
}

export function keelHome() {
  return process.env.KEEL_HOME || path.join(os.homedir(), '.claude', 'keel');
}

/** Projects that have run with a Keel lock. If one later has no lock, that's a fault, not "inactive". */
export function registry() {
  try { return JSON.parse(fs.readFileSync(path.join(keelHome(), 'projects.json'), 'utf8')); } catch { return []; }
}
export function register(projectDir) {
  const list = registry();
  if (list.includes(projectDir)) return;
  fs.mkdirSync(keelHome(), { recursive: true });
  fs.writeFileSync(path.join(keelHome(), 'projects.json'), `${JSON.stringify([...list, projectDir], null, 2)}\n`);
}

export function gitToplevel(dir) {
  try { return git(dir, ['rev-parse', '--show-toplevel']); } catch { return null; }
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

/** git's blob id for file content, computed here so a shimmed `git` can't lie about it. */
export function blobSha(buf) {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

function* walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p);
    else if (/\.sql$/i.test(ent.name)) yield p;
  }
}

export function localMigrationFiles(projectDir, policy) {
  const out = [];
  for (const d of policy.migrations.dirs) {
    const abs = path.join(projectDir, d);
    if (fs.existsSync(abs)) for (const f of walk(abs)) out.push(path.relative(projectDir, f).split(path.sep).join('/'));
  }
  return out;
}

function githubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim(); } catch { return null; }
}

/** Fetch the default branch's approvals and migration blob ids from GitHub. */
export async function fetchGithubRemote({ owner, repo }, branch, policy) {
  const token = githubToken();
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'keel-gate', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const get = async (url) => {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`GitHub ${r.status} for ${url.replace('https://api.github.com', '')}`);
    return r.json();
  };
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const tree = await get(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (tree.truncated) throw new Error('GitHub returned a truncated tree; cannot verify approvals');
  const remoteBlobs = new Map();
  const approvals = [];
  const dirs = policy.migrations.dirs.map((d) => `${d.replace(/\/$/, '')}/`);
  for (const e of tree.tree ?? []) {
    if (e.type !== 'blob') continue;
    if (dirs.some((d) => e.path.startsWith(d)) && /\.sql$/i.test(e.path)) remoteBlobs.set(e.path, e.sha);
    if (e.path.startsWith(APPROVALS) && e.path.endsWith('.json')) {
      const blob = await get(`${base}/git/blobs/${e.sha}`);
      try { approvals.push(JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))); } catch { /* skip malformed batch */ }
    }
  }
  return { approvals, remoteBlobs };
}

/** ctx.env for a project. `remote` is {approvals, remoteBlobs} once fetched; until then approvals() throws NEED_REMOTE. */
export function makeEnv(projectDir, policy, remote = null) {
  const dotenv = () => {
    const out = {};
    for (const f of ['.env', '.env.local']) {
      let text; try { text = fs.readFileSync(path.join(projectDir, f), 'utf8'); } catch { continue; }
      for (const line of text.split('\n')) {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
        if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
      }
    }
    return out;
  };
  return {
    currentBranch: (dir) => git(dir || projectDir, ['rev-parse', '--abbrev-ref', 'HEAD']),
    gitConfig: (dir, key) => { try { return git(dir || projectDir, ['config', '--get-all', key]).split('\n').filter(Boolean); } catch { return []; } },
    approvals: () => { if (!remote) throw NEED_REMOTE; return remote.approvals; },
    migrationTreeMatchesDefault: () => {
      if (!remote) throw NEED_REMOTE;
      return localMigrationFiles(projectDir, policy).every((rel) => remote.remoteBlobs.get(rel) === blobSha(fs.readFileSync(path.join(projectDir, rel))));
    },
    sha: (rel) => {
      const file = path.join(projectDir, rel);
      return fs.existsSync(file) ? contentSha(fs.readFileSync(file, 'utf8')) : null;
    },
    receipts: () => readReceipts(projectDir),
    pkgScripts: (dir) => {
      try { return JSON.parse(fs.readFileSync(path.join(dir || projectDir, 'package.json'), 'utf8')).scripts ?? {}; } catch { return {}; }
    },
    // What a tool would see: the process environment first, then the project's .env (Prisma, Drizzle and others load it).
    envVar: (name) => process.env[name] ?? dotenv()[name],
    prismaUsesDirectUrl: () => {
      for (const f of ['prisma/schema.prisma', 'schema.prisma']) {
        try { return /\bdirectUrl\s*=/.test(fs.readFileSync(path.join(projectDir, f), 'utf8')); } catch { /* next */ }
      }
      return false;
    },
    realpath: (p) => {
      // resolve symlinks in the deepest existing ancestor; keep the rest as written
      let cur = p; const tail = [];
      while (!fs.existsSync(cur) && path.dirname(cur) !== cur) { tail.unshift(path.basename(cur)); cur = path.dirname(cur); }
      try { return path.join(fs.realpathSync(cur), ...tail); } catch { return p; }
    },
    now: () => Date.now(),
  };
}

export function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}
