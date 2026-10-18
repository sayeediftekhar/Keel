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
test('rigor: HEAVY authored by the approver passes without a review (GitHub forbids self-approval, D17)', () => {
  const v = rigorVerdict(['supabase/migrations/0001.sql'], 'Rigor: HEAVY — governance', policy, [], 'Owner-Human');
  assert.equal(v.ok, true);
  assert.match(v.message, /authored by the approver @owner-human/);
  assert.match(v.message, /nobody else has reviewed/);
});
test('rigor: HEAVY authored by the agent or anyone else still waits for the approver', () => {
  for (const author of ['owner-agent', 'Owner-Agent', 'stranger', '', undefined]) {
    const v = rigorVerdict(['lib/money/a.ts'], 'Rigor: HEAVY', policy, [{ user: { login: 'owner-agent' }, state: 'APPROVED' }], author);
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
