import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeRepo, BASE_POLICY, write } from './helpers.mjs';
import { compile, denyRules, rulesetJson } from '../lib/compile.mjs';
import { normalizePolicy, PolicyError } from '../lib/policy.mjs';

test('policy validation rejects an agent holding the approval stamp', () => {
  assert.throws(() => normalizePolicy({ ...BASE_POLICY, agentIdentity: { github: 'owner-human' } }), PolicyError);
});

test('policy validation rejects unknown keys and bad modes', () => {
  assert.throws(() => normalizePolicy({ ...BASE_POLICY, gatez: {} }), /unknown key "gatez"/);
  assert.throws(() => normalizePolicy({ ...BASE_POLICY, gates: { merge: { agent: 'yolo' } } }), /gates\.merge\.agent/);
  assert.throws(() => normalizePolicy({ ...BASE_POLICY, backPressure: ['lint'] }), /checks\.lint/);
});

test('compile writes every target and the lock', () => {
  const { dir } = makeRepo();
  for (const f of ['.keel/policy.lock.json', '.claude/settings.json', '.github/CODEOWNERS', '.github/workflows/keel.yml', '.keel/ci/keel-ci.mjs', '.keel/github-ruleset.json']) {
    assert.ok(fs.existsSync(path.join(dir, f)), `${f} written`);
  }
  assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /\.keel\/receipts\.jsonl/);
});

test('CODEOWNERS puts danger paths and governance files on the approver, after existing rules', () => {
  const { dir } = makeRepo(BASE_POLICY, { extraFiles: { '.github/CODEOWNERS': '* @someone-else\n' } });
  const co = fs.readFileSync(path.join(dir, '.github/CODEOWNERS'), 'utf8');
  assert.ok(co.startsWith('* @someone-else'), 'existing rules kept');
  assert.match(co, /^\/lib\/money\/\*\* @owner-human {2}# value$/m);
  assert.match(co, /^\/keel\.policy\.json @owner-human$/m);
  assert.ok(!/receipts/.test(co), 'local receipts are not owned');
  // recompiling is idempotent
  compile(dir, { write: true });
  assert.equal(fs.readFileSync(path.join(dir, '.github/CODEOWNERS'), 'utf8'), co);
});

test('settings.json keeps user deny rules, replaces only Keel-managed ones', () => {
  const { dir } = makeRepo();
  const file = path.join(dir, '.claude/settings.json');
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  s.permissions.deny.unshift('Bash(curl:*)');
  s.permissions.allow = ['Bash(printenv DATABASE_URL)'];
  fs.writeFileSync(file, JSON.stringify(s));
  const { notes } = compile(dir, { write: true });
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(after.permissions.deny.includes('Bash(curl:*)'), 'user rule kept');
  assert.ok(after.permissions.deny.includes('Bash(printenv DATABASE_URL)'), 'Keel rule present');
  assert.equal(after.permissions.deny.filter((r) => r === 'Bash(printenv DATABASE_URL)').length, 1, 'no duplicates');
  assert.ok(notes.some((n) => /pre-allows risky/.test(n)), 'risky allow flagged');
});

test('deny rules cover each gate', () => {
  const rules = denyRules(normalizePolicy(BASE_POLICY));
  for (const r of ['Bash(printenv DATABASE_URL)', 'Bash(git push origin main)', 'mcp__github__merge_pull_request', 'Bash(vercel --prod:*)', 'Edit(./keel.policy.json)']) {
    assert.ok(rules.includes(r), r);
  }
});

test('ruleset: code-owner review, both keel checks, no bypass, no force push', () => {
  const rs = rulesetJson(normalizePolicy(BASE_POLICY));
  assert.deepEqual(rs.bypass_actors, []);
  assert.equal(rs.enforcement, 'active');
  assert.ok(rs.rules.find((r) => r.type === 'pull_request').parameters.require_code_owner_review);
  assert.deepEqual(rs.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks.map((c) => c.context), ['keel-checks', 'keel-rigor']);
  assert.ok(rs.rules.some((r) => r.type === 'non_fast_forward'));
});

test('workflow runs the back-pressure ladder and the rigor check, with PR body passed via env', () => {
  const { dir } = makeRepo({ ...BASE_POLICY, ci: { postgres: true } });
  write(dir, 'package-lock.json', '{}');
  compile(dir, { write: true });
  const y = fs.readFileSync(path.join(dir, '.github/workflows/keel.yml'), 'utf8');
  assert.match(y, /name: keel-checks/);
  assert.match(y, /run: npm ci/);
  assert.match(y, /- name: unit\n\s+run: \|\n\s+npm test/);
  assert.match(y, /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
  assert.ok(!/run:.*github\.event\.pull_request\.body/.test(y), 'PR body never interpolated into a shell line');
  assert.match(y, /image: postgres:16/);
});
