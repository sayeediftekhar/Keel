// keel init: everything a new (or existing) project needs before `keel compile`.
//
//   1. a starter keel.policy.json (never overwritten);
//   2. the always-on rules as ONE marker-managed block in the project's
//      CLAUDE.md (replaced in place on re-run): Keel's Tier-1 router only —
//      lane rule, surface names, rigor lines, invariant names, authorities
//      index, truth order — plus one @docs/INDEX.md import (D20a). The full
//      router and LAWS load on demand through the keel-v2 skill;
//   3. the standing authorization + precedence block in CLAUDE.md (D1/D6:
//      FAST ends as an auto-merging PR, HEAVY waits for the approver);
//   4. the project files Keel's pipeline reads — CONTEXT.md, GLOSSARY.md,
//      CODING_STANDARDS.md, DESIGN.md, LAWS.md, LEARNINGS.md, docs/INDEX.md,
//      docs/ARCHITECTURE.md, .scratch/ — scaffolded only if absent.
//
// Budget (lean-context Tier 1): what init writes into CLAUDE.md, with its
// import, stays within ~80 lines and ~1.5k tokens; test/init.test.mjs holds it.
//
// The plugin root is the repository root (marketplace source "."), so the
// rules and templates ship with the plugin and are read from here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POLICY_FILE, readPolicyFile } from './policy.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const KEEL_ROOT = path.join(HERE, '..', '..');
export const TEMPLATES = path.join(KEEL_ROOT, 'plugin', 'templates');
export const TIER1 = path.join(TEMPLATES, 'keel-tier1.md');
export const INDEX_IMPORT = '@docs/INDEX.md';
export const STANDARDS_TEMPLATE = path.join(KEEL_ROOT, 'conventions', 'CODING_STANDARDS.template.md');

// One marker vocabulary for both installers; any older "keel-v2 arbiter" block is replaced too.
export const ARB_BEGIN =
  '# >>> keel-v2 arbiter (managed by Keel — keel init / install.sh arbiter) — do not edit between markers >>>';
export const ARB_END = '# <<< keel-v2 arbiter <<<';
const ARB_BEGIN_RE = /^# >>> keel-v2 arbiter .*>>>\s*$/;
export const AUTH_BEGIN =
  '# >>> keel standing authorization (managed by `keel init`) — do not edit between markers >>>';
export const AUTH_END = '# <<< keel standing authorization <<<';
const AUTH_BEGIN_RE = /^# >>> keel standing authorization .*>>>\s*$/;

export const STARTER_POLICY = {
  $schema: 'https://raw.githubusercontent.com/sayeediftekhar/Keel/main/plugin/schema/keel.policy.schema.json',
  version: 1,
  approver: { github: 'YOUR-GITHUB-HANDLE' },
  agentIdentity: { github: 'your-keel-app[bot]' },
  surfaces: {
    value: ['lib/money/**'], scope: [], pii: [], access: ['lib/auth/**', 'middleware.ts'],
    schema: ['supabase/migrations/**', 'prisma/migrations/**'], secrets: ['.env*'],
  },
  environments: {
    live: { markers: ['DATABASE_URL'], supabaseProjectIds: [] },
    test: { supabaseProjectIds: [], guardFile: null },
  },
  backPressure: ['typecheck', 'unit', 'build'],
  checks: { typecheck: 'npx tsc --noEmit', unit: 'npm test', build: 'npm run build' },
};

/** Drop every block between a begin marker (by regex) and its end marker; keep everything else. */
function stripBlock(text, beginRe, end) {
  const out = [];
  let skip = false;
  for (const line of text.split('\n')) {
    if (!skip && beginRe.test(line)) { skip = true; continue; }
    if (skip && line === end) { skip = false; continue; }
    if (!skip) out.push(line);
  }
  return out.join('\n');
}

function appendBlock(text, block) {
  const head = text.replace(/\s+$/, '');
  return `${head ? `${head}\n\n` : ''}${block}\n`;
}

/** The always-on rules: Keel's Tier-1 router, and the docs index import unless the project has its own. */
export function arbiterBlock({ importIndex = true } = {}) {
  const router = fs.readFileSync(TIER1, 'utf8').replace(/\s+$/, '');
  return [
    ARB_BEGIN,
    '<!-- From the `keel` plugin; `keel init` refreshes it after a plugin update. -->',
    router,
    ...(importIndex ? ['', INDEX_IMPORT] : []),
    ARB_END,
  ].join('\n');
}

/** The standing authorization + precedence block (docs/v3/GUIDE.md §1.6-1.6b), filled from the policy. */
export function authorizationBlock(policy) {
  const approver = policy?.approver?.github && !/^YOUR-/.test(policy.approver.github)
    ? `@${policy.approver.github}`
    : 'the approver named in keel.policy.json';
  const protectedBranches = (policy?.protectedBranches ?? ['main']).join(', ');
  return [
    AUTH_BEGIN,
    '## Standing authorization (Keel v3)',
    '- FAST work (no danger surface; "LIGHT" in the policy): commit on a feature branch, push it, open a PR',
    '  whose description starts with the Rigor line, and enable `gh pr merge --auto`; GitHub merges on green.',
    '- HEAVY work: open the PR with "Rigor: HEAVY — <surfaces>" and stop.',
    `  ${approver} reviews and approves; auto-merge then completes it.`,
    '- Live migrations: apply to the test database first, then `keel batch create <id> <files>` and open a',
    '  PR. After the approver merges it you may apply exactly those migrations to live, in order.',
    `- Never use --admin, never push to ${protectedBranches}, never deploy to production.`,
    '',
    '## Precedence (Keel)',
    '- Keel governs process (rigor, laws, gates, approvals); where it differs from Claude Code\'s defaults,',
    '  follow Keel. Its gates are final: if a hook blocks, don\'t retry another way; take the path it names.',
    '- For the work itself use Claude Code\'s built-ins (plan mode, /code-review, /security-review,',
    '  Workflows, /loop); a lane\'s specialist only when the lane names one and it is installed.',
    AUTH_END,
  ].join('\n');
}

const claudeMd = (projectDir) => path.join(projectDir, 'CLAUDE.md');
const readOr = (file, fallback = '') => { try { return fs.readFileSync(file, 'utf8'); } catch { return fallback; } };

/** Write (or replace in place) the arbiter block in CLAUDE.md. Returns 'added' | 'replaced'. */
export function syncArbiter(projectDir) {
  const file = claudeMd(projectDir);
  const before = readOr(file);
  const had = before.split('\n').some((l) => ARB_BEGIN_RE.test(l));
  const stripped = stripBlock(before, ARB_BEGIN_RE, ARB_END);
  // Keep the authorization block after the rules: strip it, append rules, then re-append it.
  const auth = extractBlock(stripped, AUTH_BEGIN_RE, AUTH_END);
  const own = stripBlock(stripped, AUTH_BEGIN_RE, AUTH_END);
  // One docs index import: the project's own line wins over the block's.
  const importIndex = !own.split('\n').some((l) => l.trim() === INDEX_IMPORT);
  let next = appendBlock(own, arbiterBlock({ importIndex }));
  if (auth) next = appendBlock(next, auth);
  fs.writeFileSync(file, next);
  return had ? 'replaced' : 'added';
}

function extractBlock(text, beginRe, end) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => beginRe.test(l));
  if (i < 0) return null;
  const j = lines.indexOf(end, i + 1);
  if (j < 0) return null;
  return lines.slice(i, j + 1).join('\n');
}

/** Write (or replace in place) the standing authorization block. Returns 'added' | 'replaced'. */
export function syncAuthorization(projectDir, policy) {
  const file = claudeMd(projectDir);
  const before = readOr(file);
  const had = before.split('\n').some((l) => AUTH_BEGIN_RE.test(l));
  const next = appendBlock(stripBlock(before, AUTH_BEGIN_RE, AUTH_END), authorizationBlock(policy));
  fs.writeFileSync(file, next);
  return had ? 'replaced' : 'added';
}

export function hasAuthorization(projectDir) {
  return readOr(claudeMd(projectDir)).split('\n').some((l) => AUTH_BEGIN_RE.test(l));
}
export function hasArbiter(projectDir) {
  const text = readOr(claudeMd(projectDir));
  return text.split('\n').some((l) => ARB_BEGIN_RE.test(l)) && text.includes('Server enforces, not the UI');
}

function projectName(projectDir, given) {
  if (given) return given;
  try {
    const n = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8')).name;
    if (n) return String(n).replace(/^@[^/]+\//, '');
  } catch { /* no package.json */ }
  return path.basename(path.resolve(projectDir));
}

/** The project files the pipeline reads: [relative path, template file, fill]. */
function scaffolds(name) {
  const fill = (text) => text.replace(/<Project>/g, name);
  return [
    ['CONTEXT.md', path.join(TEMPLATES, 'CONTEXT.md'), fill],
    ['GLOSSARY.md', path.join(TEMPLATES, 'GLOSSARY.md'), fill],
    ['CODING_STANDARDS.md', STANDARDS_TEMPLATE, (t) => fill(t.replace(/<!--[\s\S]*?-->\n\n?/, ''))],
    ['DESIGN.md', path.join(TEMPLATES, 'DESIGN.md'), fill],
    ['LAWS.md', path.join(TEMPLATES, 'LAWS.md'), fill],
    ['LEARNINGS.md', path.join(TEMPLATES, 'LEARNINGS.md'), fill],
    ['docs/INDEX.md', path.join(TEMPLATES, 'docs-INDEX.md'), fill],
    ['docs/ARCHITECTURE.md', path.join(TEMPLATES, 'ARCHITECTURE.md'), fill],
    ['.scratch/README.md', path.join(TEMPLATES, 'scratch-README.md'), fill],
  ];
}

/** Run init. Returns { policy, arbiter, authorization, scaffolded, skipped, next }. */
export function init(projectDir, { scaffold = true, name } = {}) {
  const result = {
    policy: 'kept', arbiter: null, authorization: null, scaffolded: [], skipped: [], next: [],
  };
  const policyPath = path.join(projectDir, POLICY_FILE);
  if (!fs.existsSync(policyPath)) {
    fs.writeFileSync(policyPath, `${JSON.stringify(STARTER_POLICY, null, 2)}\n`);
    result.policy = 'written';
  }
  let policy = null;
  try { policy = readPolicyFile(projectDir); } catch { /* starter or broken policy: the block names "the approver" */ }

  result.arbiter = syncArbiter(projectDir);
  result.authorization = syncAuthorization(projectDir, policy);

  if (scaffold) {
    for (const [rel, template, fill] of scaffolds(projectName(projectDir, name))) {
      const abs = path.join(projectDir, rel);
      if (fs.existsSync(abs)) { result.skipped.push(rel); continue; }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, fill(fs.readFileSync(template, 'utf8')));
      result.scaffolded.push(rel);
    }
  }
  const placeholder = !policy || /^YOUR-/.test(policy.approver.github)
    || /^your-keel-app/.test(policy.agentIdentity.github);
  if (placeholder) {
    result.next.push(`edit ${POLICY_FILE}: approver, agentIdentity, danger paths (surfaces), checks — ` +
      'then run `keel init` again so the standing authorization names the approver');
  }
  result.next.push('keel compile   # lock, deny rules, CODEOWNERS, CI, ruleset — ' +
    'commit in one PR marked "Rigor: HEAVY — governance"');
  result.next.push(
    'gh api -X POST repos/<owner>/<repo>/rulesets --input .keel/github-ruleset.json   # a repo admin, once');
  result.next.push('keel doctor    # every required line ENFORCED or OK');
  return result;
}

export function formatInit(r) {
  const lines = [];
  lines.push(`${r.policy === 'written' ? '+' : '='} ${POLICY_FILE} ${r.policy}`);
  lines.push(`${r.arbiter === 'added' ? '+' : '~'} CLAUDE.md: keel-v2 Tier-1 router block ${r.arbiter}`);
  lines.push(`${r.authorization === 'added' ? '+' : '~'} CLAUDE.md: ` +
    `standing authorization + precedence block ${r.authorization}`);
  for (const f of r.scaffolded) lines.push(`+ ${f} scaffolded — fill it in`);
  for (const f of r.skipped) lines.push(`= ${f} exists, left alone`);
  lines.push('', 'Next:');
  for (const n of r.next) lines.push(`  ${n}`);
  return lines.join('\n');
}
