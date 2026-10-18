import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { rigorVerdict, budgetProblems, phantomRefs, globToRegExp as ciGlob, SECRET_SHAPES, secretFindings, ledgerFeature,
  threatModelSection, threatModelVerdict } from '../ci/keel-ci.mjs';
import { globToRegExp } from '../lib/glob.mjs';
import { SECRET_LITERAL } from '../lib/gates.mjs';
import { normalizePolicy } from '../lib/policy.mjs';
import { BASE_POLICY, makeRepo, write, commitAll, git } from './helpers.mjs';

const policy = normalizePolicy({ ...BASE_POLICY, budget: { alwaysOnTokens: 100, maxLineChars: 80 } });

test('rigor: missing record fails', () => {
  assert.equal(rigorVerdict(['README.md'], 'Fixes the typo.', policy).ok, false);
});
test('rigor: LIGHT with only safe paths passes', () => {
  assert.equal(rigorVerdict(['src/ui/button.tsx'], 'Rigor: LIGHT — surfaces 1-11 scanned, all no.', policy).ok, true);
});
test('rigor: LIGHT touching a danger path fails and names it', () => {
  const v = rigorVerdict(['lib/money/fees.ts'], 'Rigor: LIGHT — copy change', policy);
  assert.equal(v.ok, false);
  assert.match(v.message, /lib\/money\/fees\.ts \(value\)/);
});
test('rigor: LIGHT touching a governance file fails', () => {
  assert.equal(rigorVerdict(['.github/CODEOWNERS'], 'Rigor: LIGHT', policy).ok, false);
});
test('rigor: HEAVY fails until the approver approves', () => {
  const body = '- `Rigor: HEAVY — surface 8`';
  const v = rigorVerdict(['supabase/migrations/0001.sql'], body, policy, []);
  assert.equal(v.ok, false);
  assert.match(v.message, /waiting for @owner-human/);
  const approved = [{ user: { login: 'owner-agent' }, state: 'APPROVED' }, { user: { login: 'Owner-Human' }, state: 'APPROVED' }];
  assert.equal(rigorVerdict(['supabase/migrations/0001.sql'], body, policy, approved).ok, true);
  const revoked = [...approved, { user: { login: 'owner-human' }, state: 'CHANGES_REQUESTED' }];
  assert.equal(rigorVerdict(['supabase/migrations/0001.sql'], body, policy, revoked).ok, false);
});
test('rigor: an approval from someone else does not count', () => {
  assert.equal(rigorVerdict(['lib/money/a.ts'], 'Rigor: HEAVY', policy, [{ user: { login: 'owner-agent' }, state: 'APPROVED' }]).ok, false);
});

test('budget: the 16,701-character line is caught even under a line-count cap', () => {
  const { problems } = budgetProblems({ 'CONTEXT.md': `short\n${'x'.repeat(16701)}\n` }, policy);
  assert.ok(problems.some((p) => /CONTEXT\.md:2 is 16701 characters/.test(p)));
});
test('budget: token ceiling applies to always-on files', () => {
  const { problems } = budgetProblems({ 'CLAUDE.md': 'word '.repeat(15).trim().replace(/(.{70})/g, '$1\n') + '\n'.repeat(1) + 'y'.repeat(70).concat('\n').repeat(6) }, policy);
  assert.ok(problems.some((p) => /Always-on context/.test(p)));
});

test('phantom: flags only backticked repo paths that do not exist', () => {
  const text = 'See `docs/ARCHITECTURE.md`, `lib/old-model.ts`, `npm run build`, `/api/health`, `CONTEXT.md` and `https://x.y/z`.';
  const exists = (p) => ['docs/ARCHITECTURE.md', 'CONTEXT.md'].includes(p);
  assert.deepEqual(phantomRefs(text, exists), ['lib/old-model.ts']);
});

test('the CI glob matches the hook glob on the same cases', () => {
  const cases = [['lib/money/**', 'lib/money/a/b.ts', true], ['lib/money/**', 'lib/moneybag.ts', false], ['.env*', '.env.local', true],
    ['supabase/migrations/', 'supabase/migrations/1.sql', true], ['**/*.pem', 'a/b/c.pem', true], ['src/*.ts', 'src/a/b.ts', false]];
  for (const [g, p, want] of cases) {
    assert.equal(globToRegExp(g).test(p), want, `hook ${g} ~ ${p}`);
    assert.equal(ciGlob(g).test(p), want, `ci ${g} ~ ${p}`);
  }
});

test('phantom: Keel\'s managed CLAUDE.md blocks are skipped (they name Keel\'s files, not the project\'s)', () => {
  const text = [
    'See `docs/ARCHITECTURE.md`.',
    '# >>> keel-v2 arbiter (managed by Keel — keel init / install.sh arbiter) — do not edit between markers >>>',
    'Full rules in `MEMORY-CONTRACT.md`; load `memory.md`, not `graphify-out/`; ledger `.scratch/<feat>/00-status.md`.',
    '# <<< keel-v2 arbiter <<<',
    '# >>> keel standing authorization (managed by `keel init`) — do not edit between markers >>>',
    '`keel batch create <id> <files>`',
    '# <<< keel standing authorization <<<',
    'And `lib/gone.ts`.',
  ].join('\n');
  assert.deepEqual(phantomRefs(text, (p) => p === 'docs/ARCHITECTURE.md'), ['lib/gone.ts']);
});

// ------------------------------------------------- quality floor (D17/D18) ----
// Fake credentials are assembled at run time so no key-shaped literal sits in the repo.
const GHP = `ghp${'_'}${'a'.repeat(36)}`;
const AWS = `AK${'IA'}ABCDEFGHIJKLMNOP`;

test('secret scan uses exactly the secrets gate\'s shapes', () => {
  assert.equal(SECRET_SHAPES.source, SECRET_LITERAL.source);
  assert.equal(SECRET_SHAPES.flags, SECRET_LITERAL.flags);
});

test('secret scan: added lines only, with file and new line number, value never echoed whole', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts', 'index 1..2 100644', '--- a/src/a.ts', '+++ b/src/a.ts',
    '@@ -3,0 +4,2 @@', '+const ok = 1;', `+const token = "${GHP}";`,
    '@@ -9 +10,0 @@', `-const old = "${AWS}";`,
    'diff --git a/gone.ts b/gone.ts', '--- a/gone.ts', '+++ /dev/null', '@@ -1 +0,0 @@', `-${GHP}`,
  ].join('\n');
  assert.deepEqual(secretFindings(diff), [{ file: 'src/a.ts', line: 5, shape: GHP.slice(0, 8) }]);
});

test('secret scan: an added "++ x" line can\'t pose as a file header; odd file names still map', () => {
  const diff = [
    'diff --git a/a.txt b/a.txt', '--- a/a.txt', '+++ b/a.txt', '@@ -1,0 +2 @@', `+++ ${GHP}`,
    'diff --git "a/sp ace.js" "b/sp ace.js"', '--- "a/sp ace.js"\t', '+++ "b/sp ace.js"\t', '@@ -0,0 +1 @@', `+${AWS}`,
  ].join('\n');
  assert.deepEqual(secretFindings(diff).map((f) => `${f.file}:${f.line}`), ['a.txt:2', 'sp ace.js:1']);
});

test('secret scan: allowPaths (policy, not inline markers) exempt fixtures', () => {
  const diff = ['diff --git a/test/fx/keys.txt b/test/fx/keys.txt', '+++ b/test/fx/keys.txt', '@@ -0,0 +1 @@', `+${AWS} keel:allow gitleaks:allow`,
    'diff --git a/src/b.ts b/src/b.ts', '+++ b/src/b.ts', '@@ -0,0 +1 @@', `+${AWS} // gitleaks:allow`].join('\n');
  assert.deepEqual(secretFindings(diff, ['test/fx/**']).map((f) => f.file), ['src/b.ts']);
});

test('ledger lookup: "Feature:" line, then a ledger path in the body, then the longest slug in the branch', () => {
  const features = ['invoice', 'invoice-totals', 'auth'];
  assert.equal(ledgerFeature('Rigor: HEAVY — money\nFeature: `auth`', 'claude/invoice-totals', features, '.scratch'), 'auth');
  assert.equal(ledgerFeature('See .scratch/invoice-totals/spec.md', 'x', features, '.scratch'), 'invoice-totals');
  assert.equal(ledgerFeature('Rigor: HEAVY', 'claude/invoice-totals-x1y2', features, '.scratch'), 'invoice-totals');
  assert.equal(ledgerFeature('Rigor: HEAVY', 'feat/invoice', features, '.scratch'), 'invoice');
  assert.equal(ledgerFeature('Rigor: HEAVY', 'feat/authentication', features, '.scratch'), null, 'whole tokens only');
  assert.equal(ledgerFeature('Feature: ../../etc', 'x', features, '.scratch'), null, 'no path escapes');
  assert.equal(ledgerFeature('docs/plan/auth/x.md', 'x', ['auth'], 'docs/plan'), 'auth', 'custom ledger dir');
});

test('threat model section: under its heading, up to the next heading of the same depth', () => {
  const spec = '# F — Spec\n## Architecture\nA\n## Threat model\nintro\n### Boundary 1\n| a | b |\n## Rollout\nlater\n';
  assert.equal(threatModelSection(spec), 'intro\n### Boundary 1\n| a | b |');
  assert.equal(threatModelSection('## §Threat Model\nrow'), 'row');
  assert.equal(threatModelSection('## Architecture\nno threats here'), null);
});

test('threat model verdict: each missing piece is named; a real section passes', () => {
  const policy = normalizePolicy(BASE_POLICY);
  const ledger = '**Rigor:** HEAVY — money\n';
  const files = (spec) => ({ '.scratch/fees/00-status.md': ledger, ...(spec === undefined ? {} : { '.scratch/fees/spec.md': spec }) });
  const verdict = (body, fs) => threatModelVerdict({ body, branch: 'claude/x', policy, features: ['fees'], read: (rel) => fs[rel] ?? null });
  assert.match(verdict('Rigor: HEAVY', files('')).message, /names no feature ledger: add "Feature: <slug>"/);
  assert.match(verdict('Rigor: HEAVY\nFeature: nope', files('')).message, /\.scratch\/nope\/00-status\.md doesn't exist/);
  assert.match(verdict('Feature: fees', files()).message, /spec\.md is missing/);
  assert.match(verdict('Feature: fees', files('## Behaviour\nx\n')).message, /no "## Threat model" section/);
  assert.match(verdict('Feature: fees', files('## Threat model\n<!-- one row per boundary -->\n<boundary>\n\n## Next\n')).message, /section is empty/);
  const ok = verdict('Feature: fees', files('## Threat model\n| Boundary | Threat |\n|---|---|\n| client → api | tampered total (T) |\n'));
  assert.deepEqual(ok, { ok: true, message: 'Threat model: .scratch/fees/spec.md.' });
});

// End to end: the real script in a compiled repo, as the workflow runs it.
const CI = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'ci', 'keel-ci.mjs');
const runCi = (dir, cmd, env) => spawnSync(process.execPath, [CI, cmd], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

test('e2e secrets: a key added on the branch fails the scan; the same key in an allowed path passes', () => {
  const { dir } = makeRepo({ ...BASE_POLICY, quality: { secrets: { allowPaths: ['test/fixtures/**'] } } });
  write(dir, 'test/fixtures/keys.txt', `${AWS}\n`);
  commitAll(dir, 'fixture');
  const base = git(dir, 'rev-parse', 'main');
  let r = runCi(dir, 'secrets', { BASE_SHA: base, HEAD_SHA: git(dir, 'rev-parse', 'HEAD') });
  assert.equal(r.status, 0, r.stdout);
  write(dir, 'src/client.ts', `export const token = "${GHP}";\n`);
  commitAll(dir, 'leak');
  r = runCi(dir, 'secrets', { BASE_SHA: base, HEAD_SHA: git(dir, 'rev-parse', 'HEAD') });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /src\/client\.ts:1 \(ghp_aaaa…\)/);
  assert.ok(!r.stdout.includes(GHP), 'the full value never reaches the log');
  r = runCi(dir, 'secrets', {}); // first push of a branch: the whole tree
  assert.equal(r.status, 1);
});

test('e2e rigor: the threat-model rule warns by default and refuses in fail mode, on HEAVY only', () => {
  const env = (dir, body) => ({ BASE_SHA: git(dir, 'rev-parse', 'main'), HEAD_SHA: git(dir, 'rev-parse', 'HEAD'), PR_BODY: body, HEAD_REF: 'feature/x' });
  const warn = makeRepo();
  write(warn.dir, 'lib/money/fees.ts', 'export {};\n');
  commitAll(warn.dir, 'fees');
  let r = runCi(warn.dir, 'rigor', env(warn.dir, 'Rigor: HEAVY — surface 1'));
  assert.match(r.stdout, /::warning::HEAVY PR names no feature ledger/);
  assert.match(r.stdout, /::error::HEAVY: waiting for @owner-human/, 'the approval check still decides');
  const strict = makeRepo({ ...BASE_POLICY, quality: { threatModel: { mode: 'fail' } } });
  write(strict.dir, 'lib/money/fees.ts', 'export {};\n');
  commitAll(strict.dir, 'fees');
  r = runCi(strict.dir, 'rigor', env(strict.dir, 'Rigor: HEAVY — surface 1'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^::error::HEAVY PR names no feature ledger/);
  write(strict.dir, '.scratch/x/00-status.md', '**Rigor:** HEAVY — fees\n');
  write(strict.dir, '.scratch/x/spec.md', '## Threat model\n| client → api | tampered fee (T) | exact money | server recomputes | 01 |\n');
  commitAll(strict.dir, 'spec');
  r = runCi(strict.dir, 'rigor', env(strict.dir, 'Rigor: HEAVY — surface 1'));
  assert.ok(!/feature ledger|Threat model/.test(r.stdout), 'found through the branch name feature/x');
  assert.match(r.stdout, /waiting for @owner-human/);
  r = runCi(strict.dir, 'rigor', env(strict.dir, 'Rigor: LIGHT — docs'));
  assert.ok(!/feature ledger/.test(r.stdout), 'LIGHT PRs are not asked for a threat model');
});
