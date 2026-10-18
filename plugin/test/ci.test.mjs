import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  rigorVerdict, budgetProblems, phantomRefs, globToRegExp as ciGlob, SECRET_SHAPES, secretFindings, ledgerFeature,
  threatModelSection, threatModelVerdict, estimateTokens,
} from '../ci/keel-ci.mjs';
import {
  normalizeLimits, limitedFile, lineMetrics, basePool, ratchetFindings, functionMetrics, boundaryViolations,
} from '../ci/limits.mjs';
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
  const approved = [
    { user: { login: 'owner-agent' }, state: 'APPROVED' },
    { user: { login: 'Owner-Human' }, state: 'APPROVED' },
  ];
  assert.equal(rigorVerdict(['supabase/migrations/0001.sql'], body, policy, approved).ok, true);
  const revoked = [...approved, { user: { login: 'owner-human' }, state: 'CHANGES_REQUESTED' }];
  assert.equal(rigorVerdict(['supabase/migrations/0001.sql'], body, policy, revoked).ok, false);
});
test('rigor: an approval from someone else does not count', () => {
  assert.equal(
    rigorVerdict(
      ['lib/money/a.ts'], 'Rigor: HEAVY', policy, [{ user: { login: 'owner-agent' }, state: 'APPROVED' }],
    ).ok,
    false,
  );
});
test('rigor: HEAVY authored by the approver passes without a review (GitHub forbids self-approval, D21)', () => {
  const v = rigorVerdict(['supabase/migrations/0001.sql'], 'Rigor: HEAVY — governance', policy, [], 'Owner-Human');
  assert.equal(v.ok, true);
  assert.match(v.message, /authored by the approver @owner-human/);
  assert.match(v.message, /nobody else has reviewed/);
});
test('rigor: HEAVY authored by the agent or anyone else still waits for the approver', () => {
  for (const author of ['owner-agent', 'Owner-Agent', 'stranger', '', undefined]) {
    const agentApproved = [{ user: { login: 'owner-agent' }, state: 'APPROVED' }];
    const v = rigorVerdict(['lib/money/a.ts'], 'Rigor: HEAVY', policy, agentApproved, author);
    assert.equal(v.ok, false, `author=${author}`);
    assert.match(v.message, /waiting for @owner-human/);
  }
});
test('rigor: the author exemption never fires when the approver login is also the agent login', () => {
  // Policy validation forbids this; the verdict guards it anyway.
  const broken = { ...policy, agentIdentity: { github: 'owner-human' } };
  assert.equal(rigorVerdict(['lib/money/a.ts'], 'Rigor: HEAVY', broken, [], 'owner-human').ok, false);
});
test('rigor: LIGHT authored by the approver still fails on danger paths', () => {
  assert.equal(rigorVerdict(['lib/money/fees.ts'], 'Rigor: LIGHT', policy, [], 'owner-human').ok, false);
});

test('budget: the 16,701-character line is caught even under a line-count cap', () => {
  const { problems } = budgetProblems({ 'CONTEXT.md': `short\n${'x'.repeat(16701)}\n` }, policy);
  assert.ok(problems.some((p) => /CONTEXT\.md:2 is 16701 characters/.test(p)));
});
test('budget: token ceiling applies to always-on files', () => {
  const { problems } = budgetProblems({
    'CLAUDE.md': 'word '.repeat(15).trim().replace(/(.{70})/g, '$1\n') + '\n'.repeat(1) +
      'y'.repeat(70).concat('\n').repeat(6),
  }, policy);
  assert.ok(problems.some((p) => /Always-on context/.test(p)));
});

test('phantom: flags only backticked repo paths that do not exist', () => {
  const text = 'See `docs/ARCHITECTURE.md`, `lib/old-model.ts`, `npm run build`, `/api/health`, ' +
    '`CONTEXT.md` and `https://x.y/z`.';
  const exists = (p) => ['docs/ARCHITECTURE.md', 'CONTEXT.md'].includes(p);
  assert.deepEqual(phantomRefs(text, exists), ['lib/old-model.ts']);
});

test('the CI glob matches the hook glob on the same cases', () => {
  const cases = [
    ['lib/money/**', 'lib/money/a/b.ts', true], ['lib/money/**', 'lib/moneybag.ts', false],
    ['.env*', '.env.local', true], ['supabase/migrations/', 'supabase/migrations/1.sql', true],
    ['**/*.pem', 'a/b/c.pem', true], ['src/*.ts', 'src/a/b.ts', false],
  ];
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
  const diff = [
    'diff --git a/test/fx/keys.txt b/test/fx/keys.txt', '+++ b/test/fx/keys.txt', '@@ -0,0 +1 @@',
    `+${AWS} keel:allow gitleaks:allow`,
    'diff --git a/src/b.ts b/src/b.ts', '+++ b/src/b.ts', '@@ -0,0 +1 @@', `+${AWS} // gitleaks:allow`,
  ].join('\n');
  assert.deepEqual(secretFindings(diff, ['test/fx/**']).map((f) => f.file), ['src/b.ts']);
});

test('ledger lookup: "Feature:" line, then a ledger path in the body, then the longest slug in the branch', () => {
  const features = ['invoice', 'invoice-totals', 'auth'];
  assert.equal(
    ledgerFeature('Rigor: HEAVY — money\nFeature: `auth`', 'claude/invoice-totals', features, '.scratch'),
    'auth',
  );
  assert.equal(ledgerFeature('See .scratch/invoice-totals/spec.md', 'x', features, '.scratch'), 'invoice-totals');
  assert.equal(ledgerFeature('Rigor: HEAVY', 'claude/invoice-totals-x1y2', features, '.scratch'), 'invoice-totals');
  assert.equal(ledgerFeature('Rigor: HEAVY', 'feat/invoice', features, '.scratch'), 'invoice');
  assert.equal(ledgerFeature('Rigor: HEAVY', 'feat/authentication', features, '.scratch'), null, 'whole tokens only');
  assert.equal(ledgerFeature('Feature: ../../etc', 'x', features, '.scratch'), null, 'no path escapes');
  assert.equal(
    ledgerFeature('Feature: adds CSV export', 'feat/auth', features, '.scratch'),
    'auth',
    'a prose "Feature:" line is not a slug',
  );
  assert.equal(ledgerFeature('docs/plan/auth/x.md', 'x', ['auth'], 'docs/plan'), 'auth', 'custom ledger dir');
});

test('threat model section: under its heading, up to the next heading of the same depth', () => {
  const spec =
    '# F — Spec\n## Architecture\nA\n## Threat model\nintro\n### Boundary 1\n| a | b |\n## Rollout\nlater\n';
  assert.equal(threatModelSection(spec), 'intro\n### Boundary 1\n| a | b |');
  assert.equal(threatModelSection('## §Threat Model\nrow'), 'row');
  assert.equal(threatModelSection('## Architecture\nno threats here'), null);
  const fenced = '## Threat model\n```bash\n# attacker replays the token\n```\n| replay | nonce |\n## Next\n';
  assert.equal(
    threatModelSection(fenced),
    '```bash\n# attacker replays the token\n```\n| replay | nonce |',
    'a # line in a code fence is not a heading',
  );
});

test('threat model verdict: each missing piece is named; a real section passes', () => {
  const policy = normalizePolicy(BASE_POLICY);
  const ledger = '**Rigor:** HEAVY — money\n';
  const files = (spec) => ({
    '.scratch/fees/00-status.md': ledger,
    ...(spec === undefined ? {} : { '.scratch/fees/spec.md': spec }),
  });
  const verdict = (body, fs) =>
    threatModelVerdict({ body, branch: 'claude/x', policy, features: ['fees'], read: (rel) => fs[rel] ?? null });
  assert.match(verdict('Rigor: HEAVY', files('')).message, /names no feature ledger: add "Feature: <slug>"/);
  assert.match(
    verdict('Rigor: HEAVY\nFeature: nope', files('')).message,
    /\.scratch\/nope\/00-status\.md doesn't exist/,
  );
  assert.match(verdict('Feature: fees', files()).message, /spec\.md is missing/);
  assert.match(verdict('Feature: fees', files('## Behaviour\nx\n')).message, /no "## Threat model" section/);
  assert.match(
    verdict('Feature: fees', files('## Threat model\n<!-- one row per boundary -->\n<boundary>\n\n## Next\n')).message,
    /section is empty/,
  );
  const ok = verdict(
    'Feature: fees',
    files('## Threat model\n| Boundary | Threat |\n|---|---|\n| client → api | tampered total (T) |\n'),
  );
  assert.deepEqual(ok, { ok: true, message: 'Threat model: .scratch/fees/spec.md.' });
});

// End to end: the real script in a compiled repo, as the workflow runs it.
const CI = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'ci', 'keel-ci.mjs');
const runCi = (dir, cmd, env) =>
  spawnSync(process.execPath, [CI, cmd], { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

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
  const env = (dir, body) => ({
    BASE_SHA: git(dir, 'rev-parse', 'main'),
    HEAD_SHA: git(dir, 'rev-parse', 'HEAD'),
    PR_BODY: body,
    HEAD_REF: 'feature/x',
  });
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
  write(
    strict.dir,
    '.scratch/x/spec.md',
    '## Threat model\n| client → api | tampered fee (T) | exact money | server recomputes | 01 |\n',
  );
  commitAll(strict.dir, 'spec');
  r = runCi(strict.dir, 'rigor', env(strict.dir, 'Rigor: HEAVY — surface 1'));
  assert.ok(!/feature ledger|Threat model/.test(r.stdout), 'found through the branch name feature/x');
  assert.match(r.stdout, /waiting for @owner-human/);
  r = runCi(strict.dir, 'rigor', env(strict.dir, 'Rigor: LIGHT — docs'));
  assert.ok(!/feature ledger/.test(r.stdout), 'LIGHT PRs are not asked for a threat model');
});

// ---------------------------------------------------------- D20b budget ----

test('budget: tokens are a labeled conservative estimate, never chars/4', () => {
  const prose = 'Keel is a rigor router: it decides how much ceremony a task needs, then runs the lane.\n';
  const table = '| Authority | Path | Governs |\n|---|---|---|\n| Living state | CONTEXT.md | phase, handoff |\n';
  for (const t of [prose, table]) assert.ok(estimateTokens(t) > Math.ceil(t.length / 4), t);
  const big = normalizePolicy({ ...BASE_POLICY, budget: { alwaysOnTokens: 10 } });
  const { problems } = budgetProblems({ 'CLAUDE.md': prose.repeat(3) }, big);
  assert.match(problems.join('\n'), /~\d+ tokens est\. \(budget 10\)/);
});

test('budget: alwaysOnTokens defaults to 2000 and warns; a project-set number fails as before', () => {
  const dflt = normalizePolicy(BASE_POLICY);
  assert.deepEqual(dflt.budget, { alwaysOnTokens: 2000, maxLineChars: 400, mode: 'warn' });
  const huge = { 'CLAUDE.md': 'a short line of words\n'.repeat(400) };
  const r = budgetProblems(huge, dflt);
  assert.equal(r.problems.length, 0);
  assert.equal(r.warnings.length, 1);
  assert.equal(normalizePolicy({ ...BASE_POLICY, budget: { alwaysOnTokens: 900 } }).budget.mode, 'fail');
});

// ------------------------------------------------- D20e clean-code limits ----

const L = (raw = {}) => normalizeLimits(raw);
const measure = (text, lim = L(), extra = {}) => ({ lines: lineMetrics(text, lim.lineLength.max), fns: null,
  boundaries: [], ...extra });
const longLine = `const x = '${'y'.repeat(130)}';`;
const pool0 = basePool([]);

test('limits: policy shape — a number is a cap, {max, mode} overrides, mode sets every default', () => {
  const l = L({ mode: 'fail', lineLength: 100, complexity: { max: 10, mode: 'warn' } });
  assert.deepEqual(l.lineLength, { max: 100, mode: 'fail' });
  assert.deepEqual(l.complexity, { max: 10, mode: 'warn' });
  assert.deepEqual(L().fileLines, { max: 400, mode: 'warn' }, 'warn by default (D20e-d)');
  assert.deepEqual(normalizePolicy(BASE_POLICY).quality.limits, L());
});

test('limits: only source files the PR changes; docs, data, build output and exclusions never', () => {
  for (const f of ['src/a.ts', 'lib/b.mjs', 'app/c.py', 'scripts/d.sh']) assert.ok(limitedFile(f, L()), f);
  for (const f of ['README.md', 'package.json', 'dist/a.js', 'vendor/x/y.go', 'a.min.js', '.keel/ci/keel-ci.mjs',
    'gen/api.ts']) assert.ok(!limitedFile(f, L({ exclude: ['gen/**'] })), f);
});

test('limits ratchet: a changed file may not get worse; a new file meets the caps', () => {
  const lim = L({ fileLines: 3 });
  const short = 'a\nb\n'; const four = 'a\nb\nc\nd\n'; const five = 'a\nb\nc\nd\ne\n';
  assert.deepEqual(ratchetFindings('n.sh', measure(four, lim), null, pool0, lim).map((f) => f.limit), ['fileLines']);
  assert.equal(ratchetFindings('m.sh', measure(four, lim), measure(five, lim), pool0, lim).length, 0, 'shrank');
  assert.equal(ratchetFindings('m.sh', measure(five, lim), measure(four, lim), pool0, lim).length, 1, 'grew');
  assert.equal(ratchetFindings('m.sh', measure(short, lim), null, pool0, lim).length, 0);
  const one = ratchetFindings('m.sh', measure(`${longLine}\n`), measure('ok\n'), pool0, L());
  assert.deepEqual(one.map((f) => [f.limit, f.line]), [['lineLength', 1]]);
});

test('limits ratchet: code the PR only moves is not new debt (splitting a big file never fails)', () => {
  const base = measure(`${longLine}\nrest\n`);
  const pool = basePool([base]);
  assert.equal(ratchetFindings('new/part.sh', measure(`${longLine}\n`), null, pool, L()).length, 0);
  const fn = { key: "function 'decide'", label: "Function 'decide'", line: 3, metric: 'complexity', value: 30 };
  const fnPool = basePool([measure('x', L(), { fns: [fn] })]);
  const moved = measure('x', L(), { fns: [{ ...fn, line: 9 }] });
  assert.equal(ratchetFindings('lib/split.mjs', moved, null, fnPool, L()).length, 0, 'same function, same size');
  const grown = measure('x', L(), { fns: [{ ...fn, value: 31 }] });
  const msg = ratchetFindings('lib/split.mjs', grown, null, fnPool, L())[0].message;
  assert.match(msg, /complexity 31 \(cap 15, was 30\)/);
  const fresh = measure('x', L(), { fns: [{ ...fn, key: "function 'other'", label: "Function 'other'" }] });
  assert.equal(ratchetFindings('lib/split.mjs', fresh, null, fnPool, L())[0].limit, 'complexity');
});

test('limits: ESLint messages → per-function measures (named, or keyed by their first line)', () => {
  const msgs = [
    { ruleId: 'complexity', line: 1, message: "Function 'decide' has a complexity of 22. Maximum allowed is 15." },
    { ruleId: 'max-lines-per-function', line: 2,
      message: 'Arrow function has too many lines (90). Maximum allowed is 80.' },
    { ruleId: 'no-unused-vars', line: 1, message: 'ignored' },
  ];
  const got = functionMetrics(msgs, ['function decide() {', '  const f = () => {']);
  assert.deepEqual(got.map((f) => [f.metric, f.value, f.key]),
    [['complexity', 22, "function 'decide'"], ['functionLines', 90, 'line: const f = () => {']]);
});

test('limits: boundaries from the module map — a stable module may not import a volatile one', () => {
  const modules = [{ name: 'core', path: 'src/core', stability: 'stable' },
    { name: 'ui', path: 'src/ui/**', stability: 'volatile' }];
  const text = "import { a } from '../ui/button.js';\nimport b from './money.js';\nconst c = require('../ui');\n";
  assert.deepEqual(boundaryViolations('src/core/fees.ts', text, modules).map((v) => v.line), [1, 3]);
  assert.equal(boundaryViolations('src/ui/page.ts', "import x from '../core/fees.js';", modules).length, 0);
  const head = measure(text, L(), { boundaries: boundaryViolations('src/core/fees.ts', text, modules) });
  assert.equal(ratchetFindings('src/core/fees.ts', head, null, pool0, L()).length, 2);
  assert.equal(ratchetFindings('src/core/fees.ts', head, null, pool0, L({ boundaries: { mode: 'off' } })).length, 0);
});

const runLimits = (dir, env, ...args) => spawnSync(process.execPath, [CI, 'limits', ...args],
  { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

test('e2e limits: warn annotates and passes, fail fails, --mode=fail forces it; moves pass', () => {
  const quality = { limits: { lineLength: 60, functionLines: { mode: 'off' }, complexity: { mode: 'off' } } };
  const { dir } = makeRepo({ ...BASE_POLICY, quality });
  write(dir, 'scripts/old.sh', `echo ok\necho '${'x'.repeat(70)}'\n`);
  commitAll(dir, 'legacy long line');
  git(dir, 'checkout', '-q', 'main'); git(dir, 'merge', '-q', 'feature/x'); git(dir, 'checkout', '-q', 'feature/x');
  const base = git(dir, 'rev-parse', 'main');
  const head = () => ({ BASE_SHA: base, HEAD_SHA: git(dir, 'rev-parse', 'HEAD') });
  git(dir, 'mv', 'scripts/old.sh', 'scripts/moved.sh');
  commitAll(dir, 'move');
  let r = runLimits(dir, head(), '--mode=fail');
  assert.equal(r.status, 0, `moved line is not new: ${r.stdout}`);
  write(dir, 'scripts/new.sh', `echo '${'z'.repeat(70)}'\n`);
  commitAll(dir, 'new long line');
  r = runLimits(dir, head());
  assert.equal(r.status, 0, 'warn by default');
  assert.match(r.stdout, /::warning file=scripts\/new\.sh,line=1,title=keel lineLength::/);
  r = runLimits(dir, head(), '--mode=fail');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /::error file=scripts\/new\.sh/);
  r = runLimits(dir, {});
  assert.equal(r.status, 0, 'not a PR: nothing to compare');
  assert.match(r.stdout, /check pull requests/);
});

