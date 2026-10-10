import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rigorVerdict, budgetProblems, phantomRefs, globToRegExp as ciGlob } from '../ci/keel-ci.mjs';
import { globToRegExp } from '../lib/glob.mjs';
import { normalizePolicy } from '../lib/policy.mjs';
import { BASE_POLICY } from './helpers.mjs';

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
test('rigor: HEAVY passes and points to the approver review', () => {
  const v = rigorVerdict(['supabase/migrations/0001.sql'], '- `Rigor: HEAVY — surface 8`', policy);
  assert.equal(v.ok, true);
  assert.match(v.message, /@owner-human/);
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
