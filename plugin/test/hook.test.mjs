// End-to-end: the real gate.mjs and receipt.mjs against real git repos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeRepo, write, commitAll, mergeToOriginMain, git } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, '..', 'hooks', 'gate.mjs');
const RECEIPT = path.join(HERE, '..', 'hooks', 'receipt.mjs');
const KEEL = path.join(HERE, '..', 'bin', 'keel.mjs');

function run(script, dir, event) {
  const r = spawnSync(process.execPath, [script], {
    input: JSON.stringify({ cwd: dir, ...event }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: 'utf8',
  });
  return { code: r.status, err: r.stderr };
}
const gate = (dir, event) => run(GATE, dir, event);
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const apply = (project, query) => ({ tool_name: 'mcp__supabase__apply_migration', tool_input: { project_id: project, name: 'm', query } });

test('inactive project: no policy, no lock → every call allowed', () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'keel-none-'));
  assert.equal(gate(dir, bash('git push origin main')).code, 0);
});

test('push gate reads the real current branch', () => {
  const { dir } = makeRepo();
  assert.equal(gate(dir, bash('git push')).code, 0, 'feature branch push allowed');
  git(dir, 'checkout', '-q', 'main');
  const r = gate(dir, bash('git push'));
  assert.equal(r.code, 2);
  assert.match(r.err, /\[push\]/);
});

test('missing lock fails closed with the strict fallback', () => {
  const { dir } = makeRepo();
  fs.rmSync(path.join(dir, '.keel/policy.lock.json'));
  const r = gate(dir, bash('gh pr merge 3 --auto'));
  assert.equal(r.code, 2, 'strict fallback denies even auto-merge');
  assert.match(r.err, /lock.*missing|policy problem/i);
  assert.equal(gate(dir, bash('ls')).code, 0, 'harmless commands still run');
});

test('editing the policy without recompiling fails closed', () => {
  const { dir } = makeRepo();
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'keel.policy.json'), 'utf8'));
  p.gates = { merge: { agent: 'allow' } };
  fs.writeFileSync(path.join(dir, 'keel.policy.json'), JSON.stringify(p));
  const r = gate(dir, bash('gh pr merge 3'));
  assert.equal(r.code, 2);
  assert.match(r.err, /changed since the lock/);
});

test('garbage on stdin blocks (fail closed)', () => {
  const { dir } = makeRepo();
  const r = spawnSync(process.execPath, [GATE], { input: '{not json', env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('batch-authorized live migration: the full lifecycle', () => {
  const { dir } = makeRepo();
  const sql = 'ALTER TABLE fees ADD COLUMN amount numeric(15,2);\n';
  write(dir, 'supabase/migrations/0001_fee.sql', sql);

  // 1. Not approved yet → live apply blocked; test apply allowed.
  assert.equal(gate(dir, apply('liveproj', sql)).code, 2);
  assert.equal(gate(dir, apply('testproj', sql)).code, 0);

  // 2. Agent writes the batch on its branch — still not approved until merged.
  execFileSync(process.execPath, [KEEL, 'batch', 'create', 'b1', 'supabase/migrations/0001_fee.sql', '--dir', dir], { cwd: dir });
  commitAll(dir, 'migration + batch');
  let r = gate(dir, apply('liveproj', sql));
  assert.equal(r.code, 2);
  assert.match(r.err, /not in any approved/);

  // 3. Approver merges the PR → batch is on origin/main. Test-first still required.
  mergeToOriginMain(dir);
  r = gate(dir, apply('liveproj', sql));
  assert.equal(r.code, 2);
  assert.match(r.err, /test project first/);

  // 4. Apply to test, receipt written by the PostToolUse hook, then live is allowed.
  run(RECEIPT, dir, apply('testproj', sql));
  assert.equal(gate(dir, apply('liveproj', sql)).code, 0);

  // 5. After the live apply is receipted, a second apply is refused.
  run(RECEIPT, dir, apply('liveproj', sql));
  r = gate(dir, apply('liveproj', sql));
  assert.equal(r.code, 2);
  assert.match(r.err, /already applied/);
});

test('editing an approved migration voids the approval (Bash path)', () => {
  const { dir } = makeRepo();
  write(dir, 'supabase/migrations/0001_fee.sql', 'ALTER TABLE fees ADD COLUMN a int;\n');
  execFileSync(process.execPath, [KEEL, 'batch', 'create', 'b1', 'supabase/migrations/0001_fee.sql', '--dir', dir], { cwd: dir });
  commitAll(dir, 'migration + batch');
  mergeToOriginMain(dir);
  run(RECEIPT, dir, bash('supabase db push --local'));
  assert.equal(gate(dir, bash('supabase db push')).code, 0, 'approved, tested, unchanged → allowed');

  write(dir, 'supabase/migrations/0001_fee.sql', 'ALTER TABLE fees ADD COLUMN a int; DROP TABLE users;\n');
  const r = gate(dir, bash('supabase db push'));
  assert.equal(r.code, 2);
  assert.match(r.err, /differ from the default branch|no longer matches/);
});

test('governance: the agent cannot edit its own gates', () => {
  const { dir } = makeRepo();
  assert.equal(gate(dir, { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'keel.policy.json') } }).code, 2);
  assert.equal(gate(dir, bash('sed -i s/block/off/ keel.policy.json')).code, 2);
  assert.equal(gate(dir, { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'src/app.ts') } }).code, 0);
});
