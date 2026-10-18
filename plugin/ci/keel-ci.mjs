#!/usr/bin/env node
// Keel CI checks. Copied into a project as .keel/ci/keel-ci.mjs by
// `keel compile`; self-contained (no imports beyond Node built-ins).
//
//   node .keel/ci/keel-ci.mjs rigor    PR rigor record must match the diff
//   node .keel/ci/keel-ci.mjs budget   always-on context stays within budget
//   node .keel/ci/keel-ci.mjs phantom  docs name only paths that exist
//   node .keel/ci/keel-ci.mjs secrets  no credential literal in the diff's added lines

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const RECEIPTS = '.keel/receipts.jsonl';
const ZERO_SHA = '0000000000000000000000000000000000000000';
// Same shapes as the write-time secrets gate (plugin/lib/gates.mjs SECRET_LITERAL; a test keeps them equal).
export const SECRET_SHAPES = new RegExp(`(${[
  'sk-(?:proj-|ant-|live-)?[A-Za-z0-9_-]{20,}', 'sk_live_[A-Za-z0-9]{10,}', 'AKIA[0-9A-Z]{16}',
  '-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----', 'xox[baprs]-[A-Za-z0-9-]{10,}', 'ghp_[A-Za-z0-9]{36}',
  'github_pat_[A-Za-z0-9_]{22,}', 'glpat-[A-Za-z0-9_-]{20,}',
].join('|')})`);

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
      if (p[i + 1] === '*') {
        const s = p[i + 2] === '/';
        re += s ? '(?:.*/)?' : '.*';
        i += s ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  if (re.endsWith('/')) re += '.*';
  return new RegExp(`^${re}$`);
}

/** Pure: given changed files, a PR body, the policy and the PR's reviews, return {ok, message}. */
export function rigorVerdict(changed, body, policy, reviews = []) {
  const rec = /^[\s>*-]*`?\s*Rigor:\s*(FAST|LIGHT|HEAVY)\b/im.exec(body ?? '');
  if (!rec) {
    return {
      ok: false,
      message: 'The PR description needs a rigor record line, e.g. ' +
        '"Rigor: LIGHT — surfaces 1-11 scanned, all no." or "Rigor: HEAVY — surface 8 (schema)."',
    };
  }
  const level = rec[1].toUpperCase();
  const danger = [];
  const surfaces = {
    ...policy.surfaces, governance: policy.governancePaths.filter((p) => !p.startsWith('~/') && p !== RECEIPTS),
  };
  for (const f of changed) {
    for (const [s, globs] of Object.entries(surfaces)) {
      if (globs.some((g) => globToRegExp(g).test(f))) { danger.push(`${f} (${s})`); break; }
    }
  }
  if (level === 'HEAVY') {
    // Latest review per reviewer; the approver's must be APPROVED.
    const latest = new Map();
    for (const r of reviews) {
      if (r?.user?.login && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state)) {
        latest.set(r.user.login.toLowerCase(), r.state);
      }
    }
    if (latest.get(policy.approver.github.toLowerCase()) === 'APPROVED') {
      return { ok: true, message: `HEAVY: approved by @${policy.approver.github}.` };
    }
    return {
      ok: false,
      message: `HEAVY: waiting for @${policy.approver.github} to approve. This check re-runs when they review.`,
    };
  }
  if (danger.length) {
    return {
      ok: false,
      message: `The rigor record says ${level}, but this PR changes danger paths:\n  ${danger.join('\n  ')}\n` +
        'Mark it "Rigor: HEAVY — <surfaces>" so the approver reviews it.',
    };
  }
  return { ok: true, message: `${level}: no danger paths changed.` };
}

function rigor() {
  const policy = lockPolicy();
  const base = process.env.BASE_SHA; const head = process.env.HEAD_SHA;
  if (!base || !head) fail('BASE_SHA/HEAD_SHA not set; run this from the keel workflow on a pull_request.');
  const changed = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  let reviews = [];
  if (process.env.PR_NUMBER && process.env.GITHUB_REPOSITORY) {
    try {
      const out = execFileSync(
        'gh', ['api', '--paginate', `repos/${process.env.GITHUB_REPOSITORY}/pulls/${process.env.PR_NUMBER}/reviews`],
        { encoding: 'utf8' },
      );
      reviews = JSON.parse(`[${out.replace(/\]\s*\[/g, ',').replace(/^\[|\]$/g, '')}]`);
    } catch (e) { console.log(`::warning::couldn't read reviews: ${e.message}`); }
  }
  const v = rigorVerdict(changed, process.env.PR_BODY ?? '', policy, reviews);
  const tm = threatModel(policy);
  if (tm?.mode === 'fail') fail(v.ok ? tm.message : `${tm.message}\n${v.message}`);
  if (tm) console.log(`::warning::${tm.message}`);
  if (!v.ok) fail(v.message);
  console.log(v.message);
}

const RIGOR_LEVEL = /^[\s>*-]*`?\s*Rigor:\s*(FAST|LIGHT|HEAVY)\b/im;
const SLUG = '[A-Za-z0-9][A-Za-z0-9._-]*';
const reEscape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Pure: which feature ledger a PR belongs to. A "Feature: <slug>" line wins, then a ledger
 *  path in the body, then the longest ledger slug that is a whole token of the branch name. */
export function ledgerFeature(body, branch, features, dir) {
  // The whole line must be the slug: "Feature: adds CSV export" is prose, not a ledger name.
  const named = new RegExp(`^[\\s>*-]*\`?\\s*Feature:\\s*\`?(${SLUG})\`?[ \\t]*$`, 'im').exec(body ?? '')?.[1];
  if (named) return named;
  const linked = new RegExp(`(?:^|[\\s(\`/])${reEscape(dir)}/(${SLUG})/`).exec(body ?? '')?.[1];
  if (linked) return linked;
  const hits = features.filter((f) => new RegExp(`(?:^|[/_.-])${reEscape(f)}(?:$|[/_.-])`).test(branch ?? ''));
  return hits.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Pure: the text under a spec's "Threat model" heading, or null when there is no such heading. */
export function threatModelSection(spec) {
  const lines = String(spec ?? '').split('\n');
  // Heading depth per line; lines in fenced code blocks ("# attacker replays the token") aren't headings.
  let fenced = false;
  const depth = lines.map((l) => {
    if (/^\s*(```|~~~)/.test(l)) { fenced = !fenced; return 0; }
    return fenced ? 0 : (/^(#{1,6})\s/.exec(l)?.[1].length ?? 0);
  });
  const at = lines.findIndex((l, i) => depth[i] && /^#{1,6}\s*(§\s*)?Threat model\b/i.test(l));
  if (at < 0) return null;
  const end = depth.findIndex((d, i) => i > at && d && d <= depth[at]);
  return lines.slice(at + 1, end < 0 ? undefined : end).join('\n');
}

/** Pure: does a HEAVY PR's feature ledger carry a spec with a threat model (D18)?
 *  `read(rel)` returns a file's text or null; `features` lists the ledger dir's feature folders. */
export function threatModelVerdict({ body, branch, policy, features, read }) {
  const dir = policy.gates.ledger?.dir ?? '.scratch';
  const slug = ledgerFeature(body, branch, features, dir);
  if (!slug) {
    return {
      ok: false,
      message: `HEAVY PR names no feature ledger: add "Feature: <slug>" (its folder under ${dir}/) ` +
        `to the PR description, with ${dir}/<slug>/spec.md carrying §Threat model.`,
    };
  }
  const at = `${dir}/${slug}`;
  if (read(`${at}/00-status.md`) === null) {
    return { ok: false, message: `HEAVY PR names feature "${slug}", but ${at}/00-status.md doesn't exist.` };
  }
  const spec = read(`${at}/spec.md`);
  if (spec === null) {
    return {
      ok: false,
      message: `${at}/spec.md is missing: ` +
        `a HEAVY feature's spec carries §Architecture and §Threat model (keel-dev G2).`,
    };
  }
  const section = threatModelSection(spec);
  if (section === null) {
    return {
      ok: false,
      message: `${at}/spec.md has no "## Threat model" section ` +
        '(one row per trust boundary: threat, invariant, mitigation, slice).',
    };
  }
  const content = section.replace(/<!--[\s\S]*?-->/g, '').split('\n').map((l) => l.trim())
    .filter((l) => l && !/^<[^>]*>$/.test(l));
  if (!content.length) return { ok: false, message: `${at}/spec.md's Threat model section is empty.` };
  return { ok: true, message: `Threat model: ${at}/spec.md.` };
}

function threatModel(policy) {
  const mode = policy.quality?.threatModel?.mode ?? 'warn';
  if (mode === 'off' || RIGOR_LEVEL.exec(process.env.PR_BODY ?? '')?.[1]?.toUpperCase() !== 'HEAVY') return null;
  const dir = policy.gates.ledger?.dir ?? '.scratch';
  let features = [];
  try {
    features = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name);
  } catch { /* no ledgers */ }
  const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; } };
  const v = threatModelVerdict({ body: process.env.PR_BODY, branch: process.env.HEAD_REF, policy, features, read });
  return v.ok ? null : { mode, message: v.message };
}

const unquote = (p) => { if (!p.startsWith('"')) return p; try { return JSON.parse(p); } catch { return p; } };

/** Pure: credential literals on the added lines of a unified diff (`git diff -U0`). */
export function secretFindings(diff, allowPaths = []) {
  const allow = allowPaths.map(globToRegExp);
  const out = [];
  let file = null; let line = 0; let header = false;
  for (const l of String(diff ?? '').split('\n')) {
    if (l.startsWith('diff --git ')) { header = true; file = null; continue; }
    // File names only come from the header: an added line "++ x" shows as "+++ x" inside a hunk.
    if (header && l.startsWith('+++ ')) {
      file = l === '+++ /dev/null' ? null : unquote(l.slice(4).replace(/\t$/, '')).replace(/^b\//, '');
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (hunk) { header = false; line = Number(hunk[1]); continue; }
    if (header) continue;
    if (l.startsWith('+') && file) {
      const m = SECRET_SHAPES.exec(l.slice(1));
      if (m && !allow.some((re) => re.test(file))) out.push({ file, line, shape: m[0].slice(0, 8) });
      line += 1;
    } else if (l.startsWith(' ')) line += 1;
  }
  return out;
}

function secrets() {
  const policy = lockPolicy();
  const { BASE_SHA: base, HEAD_SHA: head, BEFORE_SHA: before, GITHUB_SHA: sha } = process.env;
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  let diff;
  if (base && head) diff = git('diff', '-U0', '--no-color', '--no-ext-diff', `${base}...${head}`);
  else if (before && before !== ZERO_SHA && sha) diff = git('diff', '-U0', '--no-color', '--no-ext-diff', before, sha);
  else {
    diff = git(
      'diff', '-U0', '--no-color', '--no-ext-diff', git('hash-object', '-t', 'tree', '/dev/null').trim(), 'HEAD',
    ); // first push: every tracked line
  }
  const found = secretFindings(diff, policy.quality?.secrets?.allowPaths ?? []);
  if (found.length) {
    fail(
      `${found.length} line(s) add what looks like a live credential:\n` +
        `${found.map((f) => `  ${f.file}:${f.line} (${f.shape}…)`).join('\n')}\n` +
        'Remove it from the branch history, rotate it, and read it from an environment variable. ' +
        'A fixture path that must hold key-shaped strings goes in quality.secrets.allowPaths.',
    );
  }
  console.log('No credential literals on the added lines.');
}

/** Pure: files map {name: content} → list of problems. */
export function budgetProblems(files, policy) {
  const problems = [];
  let chars = 0;
  for (const [name, text] of Object.entries(files)) {
    if (name !== 'CONTEXT.md') chars += text.length;
    text.split('\n').forEach((line, i) => {
      if (line.length > policy.budget.maxLineChars) {
        problems.push(
          `${name}:${i + 1} is ${line.length} characters (limit ${policy.budget.maxLineChars}). ` +
            'Long lines hide content from line-count budgets; split it.',
        );
      }
    });
  }
  const tokens = Math.ceil(chars / 4);
  if (policy.budget.alwaysOnTokens && tokens > policy.budget.alwaysOnTokens) {
    problems.push(
      `Always-on context is ~${tokens} tokens (budget ${policy.budget.alwaysOnTokens}). ` +
        'Move detail into files fetched on demand.',
    );
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

/** Keel's managed CLAUDE.md blocks (rules, standing authorization) name Keel's own files, not the project's. */
export function stripManagedBlocks(text) {
  const out = [];
  let skip = false;
  for (const line of String(text ?? '').split('\n')) {
    if (!skip && /^# >>> keel.*>>>\s*$/.test(line)) { skip = true; continue; }
    if (skip && /^# <<< keel.*<<<\s*$/.test(line)) { skip = false; continue; }
    if (!skip) out.push(line);
  }
  return out.join('\n');
}

/** Pure: find backticked repo paths in doc text that don't exist (Keel's managed blocks are skipped). */
export function phantomRefs(text, exists) {
  const missing = new Set();
  for (const m of stripManagedBlocks(text).matchAll(/`([^`\n]+)`/g)) {
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
    for (const p of phantomRefs(text, (rel) => fs.existsSync(path.join(ROOT, rel)))) {
      problems.push(`${doc} names \`${p}\`, which doesn't exist.`);
    }
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
  else if (cmd === 'secrets') secrets();
  else { console.log('usage: keel-ci.mjs rigor|budget|phantom|secrets'); process.exit(2); }
}
