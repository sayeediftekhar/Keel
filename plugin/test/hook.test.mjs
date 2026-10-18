// End-to-end: the real gate.mjs and receipt.mjs against real git repos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeRepo, write, commitAll, mergeToOriginMain, git, fakeGithub } from './helpers.mjs';
import { evaluate } from '../lib/hookmain.mjs';

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
const apply = (project, query) => ({
  tool_name: 'mcp__supabase__apply_migration', tool_input: { project_id: project, name: 'm', query },
});

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
  const r = spawnSync(process.execPath, [GATE], {
    input: '{not json', env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8',
  });
  assert.equal(r.status, 2);
});

/** In-process gate with GitHub simulated by the bare origin. Returns {code, err} like the hook. */
async function gateRemote(dir, origin, event) {
  const prev = process.env.CLAUDE_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = dir;
  try {
    const d = await evaluate({ cwd: dir, ...event }, { fetchRemote: fakeGithub(origin) });
    return d.allow ? { code: 0, err: '' } : { code: 2, err: `[${d.gate}] ${d.reason}` };
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = prev;
  }
}

test('batch-authorized live migration: the full lifecycle', async () => {
  const { dir, origin } = makeRepo();
  const g = (ev) => gateRemote(dir, origin, ev);
  const sql = 'ALTER TABLE fees ADD COLUMN amount numeric(15,2);\n';
  write(dir, 'supabase/migrations/0001_fee.sql', sql);

  // 1. Not approved yet → live apply blocked; test apply allowed.
  assert.equal((await g(apply('liveproj', sql))).code, 2);
  assert.equal((await g(apply('testproj', sql))).code, 0);

  // 2. Agent writes the batch on its branch — not approved until merged on the remote.
  execFileSync(
    process.execPath, [KEEL, 'batch', 'create', 'b1', 'supabase/migrations/0001_fee.sql', '--dir', dir], { cwd: dir },
  );
  commitAll(dir, 'migration + batch');
  let r = await g(apply('liveproj', sql));
  assert.equal(r.code, 2);
  assert.match(r.err, /not in any approved/);

  // 2b. Rewriting the LOCAL origin/main ref doesn't help: approvals come from the remote.
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  r = await g(apply('liveproj', sql));
  assert.equal(r.code, 2, 'a forged local ref is not an approval');

  // 3. Approver merges the PR → batch is on the remote main. Test-first still required.
  mergeToOriginMain(dir);
  r = await g(apply('liveproj', sql));
  assert.equal(r.code, 2);
  assert.match(r.err, /test project first/);

  // 4. Apply to test, receipt written by the PostToolUse hook, then live is allowed.
  run(RECEIPT, dir, apply('testproj', sql));
  assert.equal((await g(apply('liveproj', sql))).code, 0);

  // 5. After the live apply is receipted, a second apply is refused.
  run(RECEIPT, dir, apply('liveproj', sql));
  r = await g(apply('liveproj', sql));
  assert.equal(r.code, 2);
  assert.match(r.err, /already applied/);
});

test('Bash live push: local migrations must match the remote; edits void approval', async () => {
  const { dir, origin } = makeRepo();
  const g = (ev) => gateRemote(dir, origin, ev);
  write(dir, 'supabase/migrations/0001_fee.sql', 'ALTER TABLE fees ADD COLUMN a int;\n');
  execFileSync(
    process.execPath, [KEEL, 'batch', 'create', 'b1', 'supabase/migrations/0001_fee.sql', '--dir', dir], { cwd: dir },
  );
  commitAll(dir, 'migration + batch');
  mergeToOriginMain(dir);
  run(RECEIPT, dir, bash('supabase db push --local'));
  assert.equal((await g(bash('supabase db push'))).code, 0, 'approved, tested, unchanged → allowed');

  write(dir, 'supabase/migrations/0002_extra.sql', 'DROP TABLE users;\n');
  let r = await g(bash('supabase db push'));
  assert.equal(r.code, 2, 'an unreviewed extra migration file blocks the push');
  fs.rmSync(path.join(dir, 'supabase/migrations/0002_extra.sql'));

  write(dir, 'supabase/migrations/0001_fee.sql', 'ALTER TABLE fees ADD COLUMN a int; DROP TABLE users;\n');
  r = await g(bash('supabase db push'));
  assert.equal(r.code, 2);
  assert.match(r.err, /differ from the default branch|no longer matches/);
});

test('keel batch create: project-relative paths through a symlinked dir; files outside the project refused', () => {
  const { dir, root } = makeRepo();
  const link = path.join(root, 'link');
  fs.symlinkSync(dir, link);
  write(dir, 'supabase/migrations/0001_fee.sql', 'ALTER TABLE fees ADD COLUMN a int;\n');
  // --dir through the symlink, cwd on the real path (what macOS /var vs /private/var does)
  execFileSync(
    process.execPath,
    [KEEL, 'batch', 'create', 'b1', 'supabase/migrations/0001_fee.sql', '--dir', link],
    { cwd: fs.realpathSync(dir) },
  );
  const b = JSON.parse(fs.readFileSync(path.join(dir, '.keel/approvals/b1.json'), 'utf8'));
  assert.equal(b.migrations[0].file, 'supabase/migrations/0001_fee.sql');
  write(root, 'outside.sql', 'DROP TABLE users;\n');
  const r = spawnSync(
    process.execPath,
    [KEEL, 'batch', 'create', 'b2', path.join(root, 'outside.sql'), '--dir', dir],
    { cwd: dir, encoding: 'utf8' },
  );
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /outside the project/);
});

test('GitHub unreachable → live migration blocked (fail closed)', async () => {
  const { dir } = makeRepo();
  process.env.CLAUDE_PROJECT_DIR = dir;
  try {
    const d = await evaluate(
      { cwd: dir, ...apply('liveproj', 'select 1') },
      { fetchRemote: async () => { throw new Error('ENOTFOUND api.github.com'); } },
    );
    assert.equal(d.allow, false);
    assert.match(d.reason, /verified on GitHub.*ENOTFOUND/);
  } finally { delete process.env.CLAUDE_PROJECT_DIR; }
});

test('a project that used Keel and lost its lock fails closed, not open', () => {
  const { dir } = makeRepo();
  assert.equal(gate(dir, bash('ls')).code, 0); // registers the project
  fs.rmSync(path.join(dir, '.keel'), { recursive: true, force: true });
  fs.rmSync(path.join(dir, 'keel.policy.json'));
  const r = gate(dir, bash('git push origin main'));
  assert.equal(r.code, 2);
  assert.match(r.err, /used Keel/);
});

test('a moved project directory fails closed', () => {
  const { dir, root } = makeRepo();
  const moved = path.join(root, 'moved');
  fs.renameSync(dir, moved);
  const r = spawnSync(process.execPath, [GATE], {
    input: JSON.stringify({ cwd: moved, tool_name: 'Bash', tool_input: { command: 'git push origin main' } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    encoding: 'utf8',
  });
  assert.equal(r.status, 2);
});

test('governance: the agent cannot edit its own gates', () => {
  const { dir } = makeRepo();
  assert.equal(gate(dir, { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'keel.policy.json') } }).code, 2);
  assert.equal(gate(dir, bash('sed -i s/block/off/ keel.policy.json')).code, 2);
  assert.equal(gate(dir, { tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'src/app.ts') } }).code, 0);
});
