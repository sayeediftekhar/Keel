// The doctor must go red on exactly the gate that was removed (M1-SPEC §8.3):
// a guard you've never watched fail is faith, not enforcement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeRepo, BASE_POLICY } from './helpers.mjs';
import { doctor, exitCode, rulesetVerdict } from '../lib/doctor.mjs';
import { rulesetJson } from '../lib/compile.mjs';
import { normalizePolicy } from '../lib/policy.mjs';

const status = (items, id) => items.find((i) => i.id === id)?.status;
const installed = () => [{ name: 'keel@keel', enabled: true }];
const doc = (dir, opts = {}) => doctor(dir, { offline: true, pluginList: installed, ...opts });

test('healthy fixture: every local item OK/ENFORCED; GitHub UNPROVEN offline', () => {
  const { dir } = makeRepo();
  const items = doc(dir);
  for (const i of items.filter((x) => x.required && !['github-ruleset', 'agent-identity'].includes(x.id))) {
    assert.ok(['OK', 'ENFORCED'].includes(i.status), `${i.id}: ${i.status} — ${i.detail}`);
  }
  for (const g of [
    'gate:push', 'gate:merge', 'gate:migration', 'gate:secrets', 'gate:governance', 'gate:deploy', 'gate:ledger',
  ]) {
    assert.equal(status(items, g), 'ENFORCED', g);
  }
  assert.equal(status(items, 'github-ruleset'), 'UNPROVEN');
  assert.equal(exitCode(items), 1, 'UNPROVEN required items fail by default');
  assert.equal(exitCode(items, { allowUnproven: true }), 0);
});

test('a sabotaged gate script is caught: every gate reports BROKEN', () => {
  const { dir } = makeRepo();
  const fake = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'keel-fake-')), 'gate.mjs');
  fs.writeFileSync(fake, 'process.exit(0);\n'); // a "gate" that allows everything
  const items = doc(dir, { gate: fake });
  for (const g of [
    'gate:push', 'gate:merge', 'gate:migration', 'gate:secrets', 'gate:governance', 'gate:deploy', 'gate:ledger',
  ]) {
    assert.equal(status(items, g), 'BROKEN', g);
  }
});

const removals = [
  ['deny-rules', (dir) => {
    const f = path.join(dir, '.claude/settings.json');
    const s = JSON.parse(fs.readFileSync(f, 'utf8'));
    s.permissions.deny = [];
    fs.writeFileSync(f, JSON.stringify(s));
  }, 'BROKEN'],
  ['codeowners', (dir) => fs.rmSync(path.join(dir, '.github/CODEOWNERS')), 'MISSING'],
  ['workflow', (dir) => fs.appendFileSync(path.join(dir, '.github/workflows/keel.yml'), '\n# tampered\n'), 'BROKEN'],
  ['ci-script', (dir) => fs.rmSync(path.join(dir, '.keel/ci/keel-ci.mjs')), 'MISSING'],
  ['hooks-enabled', (dir) =>
    fs.writeFileSync(path.join(dir, '.claude/settings.local.json'), JSON.stringify({ disableAllHooks: true })),
  'BROKEN'],
  ['lock', (dir) =>
    fs.writeFileSync(path.join(dir, '.keel/policy.lock.json'), '{"policy":{},"policySha256":"x"}'), 'BROKEN'],
  ['test-db-guard', (dir) => {
    fs.writeFileSync(path.join(dir, 'test/setup.js'), '// nothing here\n');
    fs.mkdirSync(path.join(dir, 'supabase/migrations'), { recursive: true });
  }, 'BROKEN'],
];

for (const [id, remove, expected] of removals) {
  test(`removing ${id} turns exactly that item red`, () => {
    const { dir } = makeRepo();
    const before = doc(dir);
    remove(dir);
    const after = doc(dir);
    assert.equal(status(after, id), expected, `${id} → ${expected}`);
    const newlyRed = after
      .filter((i) => i.required && ['OK', 'ENFORCED'].includes(status(before, i.id)) &&
        !['OK', 'ENFORCED'].includes(i.status))
      .map((i) => i.id);
    if (id !== 'lock') assert.deepEqual(newlyRed, [id], `only ${id} went red, got ${newlyRed}`);
  });
}

test('the plugin not being installed in Claude Code is BROKEN, not OK', () => {
  const { dir } = makeRepo();
  assert.equal(status(doc(dir, { pluginList: () => [] }), 'plugin-installed'), 'BROKEN');
  assert.equal(
    status(doc(dir, { pluginList: () => [{ name: 'keel@keel', enabled: false }] }), 'plugin-installed'), 'BROKEN',
  );
  assert.equal(
    status(doc(dir, { pluginList: () => { throw new Error('no claude'); } }), 'plugin-installed'), 'UNPROVEN',
  );
});

// github-ruleset is UNPROVEN offline, so its judgement is a pure function tested here. The live facts
// behind it (D22, public probe repo, 2026-10-18): require_last_push_approval at review count 0 blocks
// every PR for every author; require_code_owner_review at count 0 does not block the owner's own PR.
const livePolicy = normalizePolicy(BASE_POLICY);
const liveRuleset = (mutate = () => {}) => {
  const rs = { id: 42, ...rulesetJson(livePolicy) }; // what GitHub returns for the ruleset Keel compiles
  mutate(rs, rs.rules.find((r) => r.type === 'pull_request').parameters);
  return rs;
};

test('rulesetVerdict: the ruleset Keel compiles, applied as-is, is OK', () => {
  const v = rulesetVerdict(liveRuleset(), livePolicy);
  assert.equal(v.status, 'OK');
  assert.match(v.detail, /no last-push approval/);
});

test('rulesetVerdict: require_last_push_approval on is BROKEN and names the PUT to fix it', () => {
  const v = rulesetVerdict(liveRuleset((rs, pr) => { pr.require_last_push_approval = true; }), livePolicy);
  assert.equal(v.status, 'BROKEN');
  assert.match(v.detail, /blocks every PR/);
  assert.match(v.detail, /rulesets\/42 --input \.keel\/github-ruleset\.json/);
});

test('rulesetVerdict: any bypass actor is BROKEN, even the admin pull_request one', () => {
  const v = rulesetVerdict(liveRuleset((rs) => { rs.bypass_actors = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }]; }), livePolicy);
  assert.equal(v.status, 'BROKEN');
  assert.match(v.detail, /1 bypass actor/);
});

test('rulesetVerdict: a ruleset that is not Keel\'s is null (reported MISSING), not BROKEN', () => {
  assert.equal(rulesetVerdict(liveRuleset((rs) => { rs.enforcement = 'disabled'; }), livePolicy), null);
  assert.equal(rulesetVerdict(liveRuleset((rs, pr) => { pr.require_code_owner_review = false; }), livePolicy), null);
  assert.equal(rulesetVerdict(liveRuleset((rs) => { rs.conditions.ref_name.include = ['refs/heads/release']; }), livePolicy), null);
  assert.equal(rulesetVerdict(liveRuleset((rs) => {
    rs.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks = [{ context: 'keel-checks' }];
  }), livePolicy), null);
  assert.equal(rulesetVerdict(liveRuleset((rs) => { rs.rules = rs.rules.filter((r) => r.type !== 'non_fast_forward'); }), livePolicy), null);
});
