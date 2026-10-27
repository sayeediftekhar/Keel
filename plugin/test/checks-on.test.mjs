// ci.checksOn: keel-checks in a workflow of its own, run only when a PR's code changes,
// while keel-rigor keeps every event (body edits, reviews, pushes to protected branches).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeRepo, BASE_POLICY, write } from './helpers.mjs';
import { compile, denyRules, rulesetJson, WORKFLOW, CHECKS_WORKFLOW, CODEOWNERS } from '../lib/compile.mjs';
import { doctor, probe } from '../lib/doctor.mjs';
import { normalizePolicy } from '../lib/policy.mjs';

const SPLIT = { ...BASE_POLICY, ci: { checksOn: 'code-changes' } };
const job = (y, name) => {
  const start = y.indexOf(`  ${name}:\n`);
  const next = y.slice(start + 1).search(/^ {2}[a-z-]+:\n/m);
  return next < 0 ? y.slice(start) : y.slice(start, start + 1 + next);
};
const onBlock = (y) => y.slice(y.indexOf('\non:\n') + 1, y.indexOf('\npermissions:'));
const status = (items, id) => items.find((i) => i.id === id)?.status;
const doc = (dir) => doctor(dir, { offline: true, pluginList: () => [{ name: 'keel@keel', enabled: true }] });

test('checksOn: invalid values are rejected; "all" is the default and leaves the lock unchanged', () => {
  assert.throws(() => normalizePolicy({ ...BASE_POLICY, ci: { checksOn: 'sometimes' } }), /ci\.checksOn/);
  const before = normalizePolicy(BASE_POLICY);
  assert.deepEqual(normalizePolicy({ ...BASE_POLICY, ci: { checksOn: 'all' } }), before);
  assert.ok(!('checksOn' in before.ci), 'existing locks keep their hash');
  assert.ok(!before.governancePaths.includes(CHECKS_WORKFLOW));
  const { files } = compile(makeRepo().dir);
  assert.ok(!(CHECKS_WORKFLOW in files), 'no second workflow by default');
  assert.match(files[WORKFLOW], /^ {2}keel-checks:$/m);
});

test('checksOn "code-changes": keel-checks.yml runs only on opened/synchronize/reopened, keel.yml keeps rigor', () => {
  const { dir } = makeRepo({ ...SPLIT, ci: { ...SPLIT.ci, postgres: true } });
  write(dir, 'package-lock.json', '{}');
  const all = compile(dir).files;
  const checks = all[CHECKS_WORKFLOW];
  const keel = all[WORKFLOW];
  assert.equal(onBlock(checks), 'on:\n  pull_request:\n    types: [opened, synchronize, reopened]');
  assert.match(checks, /^name: keel-checks$/m);
  assert.match(checks, /group: keel-checks-\$\{\{ github\.ref \}\}/);
  assert.ok(!/^\s+if:/m.test(job(checks, 'keel-checks').split('steps:')[0]), 'no job-level if:');
  assert.match(checks, /- name: unit\n\s+run: \|\n\s+npm test/);
  assert.match(checks, /image: postgres:16/);
  assert.ok(!/^ {2}keel-checks:$/m.test(keel), 'keel-checks left keel.yml');
  assert.match(onBlock(keel), /types: \[opened, synchronize, reopened, edited\]/);
  assert.match(onBlock(keel), /pull_request_review:\n\s+types: \[submitted, dismissed\]/);
  assert.match(onBlock(keel), /push:\n\s+branches: \['main'\]/);
  assert.match(keel, /group: keel-\$\{\{ github\.ref \}\}/);
  assert.match(keel, /^ {2}keel-rigor:$/m);
});

test('checksOn "code-changes": the keel-checks job is byte-identical to the one keel.yml carries by default', () => {
  const { dir } = makeRepo(SPLIT);
  const split = compile(dir).files[CHECKS_WORKFLOW];
  fs.writeFileSync(path.join(dir, 'keel.policy.json'), JSON.stringify(BASE_POLICY));
  const whole = compile(dir).files[WORKFLOW];
  assert.equal(job(split, 'keel-checks'), job(whole, 'keel-checks'));
  assert.equal(job(compile(makeRepo(SPLIT).dir).files[WORKFLOW], 'keel-rigor'), job(whole, 'keel-rigor'));
});

test('checksOn "code-changes": keel-checks.yml is a governance file; the ruleset still requires keel-checks', () => {
  const policy = normalizePolicy(SPLIT);
  assert.ok(policy.governancePaths.includes(CHECKS_WORKFLOW));
  assert.ok(denyRules(policy).includes(`Edit(./${CHECKS_WORKFLOW})`));
  assert.ok(!denyRules(normalizePolicy(BASE_POLICY)).includes(`Edit(./${CHECKS_WORKFLOW})`));
  const { dir } = makeRepo(SPLIT);
  const owners = fs.readFileSync(path.join(dir, CODEOWNERS), 'utf8');
  assert.match(owners, /^\/\.github\/workflows\/keel-checks\.yml @owner-human$/m);
  const edit = { tool_name: 'Edit', tool_input: { file_path: path.join(dir, CHECKS_WORKFLOW) } };
  assert.ok(probe(dir, edit).blocked, 'the governance gate blocks an agent edit');
  assert.deepEqual(
    rulesetJson(policy).rules.find((r) => r.type === 'required_status_checks')
      .parameters.required_status_checks.map((c) => c.context),
    ['keel-checks', 'keel-rigor'],
  );
});

test('doctor checks keel-checks.yml when split, and flags a leftover one when not', () => {
  const split = makeRepo(SPLIT).dir;
  const healthy = doc(split);
  assert.equal(status(healthy, 'checks-workflow'), 'OK');
  assert.equal(status(healthy, 'workflow'), 'OK');
  fs.appendFileSync(path.join(split, CHECKS_WORKFLOW), '\n# tampered\n');
  assert.equal(status(doc(split), 'checks-workflow'), 'BROKEN');
  fs.rmSync(path.join(split, CHECKS_WORKFLOW));
  assert.equal(status(doc(split), 'checks-workflow'), 'MISSING');

  const whole = makeRepo().dir;
  assert.equal(status(doc(whole), 'checks-workflow'), undefined, 'not reported when there is nothing to check');
  write(whole, CHECKS_WORKFLOW, 'name: keel-checks\n');
  assert.equal(status(doc(whole), 'checks-workflow'), 'BROKEN');
  assert.ok(compile(whole).notes.some((n) => n.includes(`${CHECKS_WORKFLOW} exists`)));
});
