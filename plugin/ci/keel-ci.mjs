#!/usr/bin/env node
// Keel CI checks. Copied into a project as .keel/ci/keel-ci.mjs by
// `keel compile`; self-contained (no imports beyond Node built-ins).
//
//   node .keel/ci/keel-ci.mjs rigor    PR rigor record must match the diff
//   node .keel/ci/keel-ci.mjs budget   always-on context stays within budget
//   node .keel/ci/keel-ci.mjs phantom  docs name only paths that exist

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const RECEIPTS = '.keel/receipts.jsonl';

function lockPolicy() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, '.keel/policy.lock.json'), 'utf8')).policy; }
  catch (e) { fail(`cannot read .keel/policy.lock.json (${e.message}). Run \`keel compile\` and commit the result.`); }
}

function fail(msg) { console.log(`::error::${msg}`); process.exit(1); }

export function globToRegExp(pattern) {
  const p = String(pattern).replace(/^\.\//, '').replace(/^\//, '');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') { const s = p[i + 2] === '/'; re += s ? '(?:.*/)?' : '.*'; i += s ? 2 : 1; } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  if (re.endsWith('/')) re += '.*';
  return new RegExp(`^${re}$`);
}

/** Pure: given changed files, a PR body and the policy, return {ok, message}. */
export function rigorVerdict(changed, body, policy) {
  const rec = /^[\s>*-]*`?\s*Rigor:\s*(FAST|LIGHT|HEAVY)\b/im.exec(body ?? '');
  if (!rec) return { ok: false, message: 'The PR description needs a rigor record line, e.g. "Rigor: LIGHT — surfaces 1-11 scanned, all no." or "Rigor: HEAVY — surface 8 (schema)."' };
  const level = rec[1].toUpperCase();
  const danger = [];
  const surfaces = { ...policy.surfaces, governance: policy.governancePaths.filter((p) => !p.startsWith('~/') && p !== RECEIPTS) };
  for (const f of changed) {
    for (const [s, globs] of Object.entries(surfaces)) {
      if (globs.some((g) => globToRegExp(g).test(f))) { danger.push(`${f} (${s})`); break; }
    }
  }
  if (level === 'HEAVY') return { ok: true, message: `HEAVY: GitHub requires @${policy.approver.github}'s review before this merges.` };
  if (danger.length) return { ok: false, message: `The rigor record says ${level}, but this PR changes danger paths:\n  ${danger.join('\n  ')}\nMark it "Rigor: HEAVY — <surfaces>" so the approver reviews it.` };
  return { ok: true, message: `${level}: no danger paths changed.` };
}

function rigor() {
  const policy = lockPolicy();
  const base = process.env.BASE_SHA; const head = process.env.HEAD_SHA;
  if (!base || !head) fail('BASE_SHA/HEAD_SHA not set; run this from the keel workflow on a pull_request.');
  const changed = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const v = rigorVerdict(changed, process.env.PR_BODY ?? '', policy);
  if (!v.ok) fail(v.message);
  console.log(v.message);
}

/** Pure: files map {name: content} → list of problems. */
export function budgetProblems(files, policy) {
  const problems = [];
  let chars = 0;
  for (const [name, text] of Object.entries(files)) {
    if (name !== 'CONTEXT.md') chars += text.length;
    text.split('\n').forEach((line, i) => {
      if (line.length > policy.budget.maxLineChars) problems.push(`${name}:${i + 1} is ${line.length} characters (limit ${policy.budget.maxLineChars}). Long lines hide content from line-count budgets; split it.`);
    });
  }
  const tokens = Math.ceil(chars / 4);
  if (policy.budget.alwaysOnTokens && tokens > policy.budget.alwaysOnTokens) {
    problems.push(`Always-on context is ~${tokens} tokens (budget ${policy.budget.alwaysOnTokens}). Move detail into files fetched on demand.`);
  }
  return { problems, tokens };
}

function alwaysOnFiles() {
  const out = {};
  const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; } };
  for (const rel of ['CLAUDE.md', '.claude/CLAUDE.md', 'AGENTS.md', 'CONTEXT.md']) {
    const t = read(rel); if (t !== null) out[rel] = t;
  }
  for (const rel of ['CLAUDE.md', '.claude/CLAUDE.md']) {
    for (const m of (out[rel] ?? '').matchAll(/^@([^\s]+)\s*$/gm)) {
      const t = read(m[1]); if (t !== null) out[m[1]] = t;
    }
  }
  return out;
}

function budget() {
  const policy = lockPolicy();
  const { problems, tokens } = budgetProblems(alwaysOnFiles(), policy);
  if (problems.length) fail(problems.join('\n'));
  console.log(`Always-on context ~${tokens} tokens; no over-long lines.`);
}

/** Pure: find backticked repo paths in doc text that don't exist. */
export function phantomRefs(text, exists) {
  const missing = new Set();
  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    const s = m[1].trim().replace(/^\.\//, '');
    if (!/^[\w.\-/@]+$/.test(s) || s.startsWith('/') || s.startsWith('@') || s.includes('://')) continue;
    if (!(s.includes('/') || /\.(md|json|ts|tsx|js|mjs|cjs|sql|sh|ya?ml|prisma|toml)$/.test(s))) continue;
    if (/^(npm|npx|pnpm|yarn|git|gh|node)\b/.test(s)) continue;
    if (!exists(s.replace(/\/$/, ''))) missing.add(s);
  }
  return [...missing];
}

function phantom() {
  const policy = lockPolicy();
  const problems = [];
  for (const doc of ['CLAUDE.md', 'AGENTS.md', 'CONTEXT.md', 'LAWS.md']) {
    let text; try { text = fs.readFileSync(path.join(ROOT, doc), 'utf8'); } catch { continue; }
    for (const p of phantomRefs(text, (rel) => fs.existsSync(path.join(ROOT, rel)))) problems.push(`${doc} names \`${p}\`, which doesn't exist.`);
  }
  if (!problems.length) { console.log('Docs reference only paths that exist.'); return; }
  if (policy.ci.phantom === 'fail') fail(problems.join('\n'));
  for (const p of problems) console.log(`::warning::${p}`);
}

const cmd = process.argv[2];
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (cmd === 'rigor') rigor();
  else if (cmd === 'budget') budget();
  else if (cmd === 'phantom') phantom();
  else { console.log('usage: keel-ci.mjs rigor|budget|phantom'); process.exit(2); }
}
