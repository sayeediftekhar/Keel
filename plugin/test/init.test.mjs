// keel init: the rules reach CLAUDE.md as one managed block, the standing
// authorization names the approver, scaffolds are written once and never
// overwritten, and nothing the human wrote is lost on re-run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  init, syncArbiter, ARB_BEGIN, ARB_END, AUTH_BEGIN, AUTH_END, hasArbiter, hasAuthorization,
} from '../lib/init.mjs';
import { compile } from '../lib/compile.mjs';
import { doctor } from '../lib/doctor.mjs';
import { BASE_POLICY, write } from './helpers.mjs';

const CLI = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'bin', 'keel.mjs');

function emptyRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keel-init-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const count = (text, needle) => text.split('\n').filter((l) => l === needle).length;

test('init on an empty repo: policy, both CLAUDE.md blocks, every scaffold', () => {
  const dir = emptyRepo();
  const r = init(dir);
  assert.equal(r.policy, 'written');
  assert.equal(r.arbiter, 'added');
  assert.equal(r.authorization, 'added');
  assert.deepEqual(
    r.scaffolded, ['CONTEXT.md', 'GLOSSARY.md', 'CODING_STANDARDS.md', 'DESIGN.md', '.scratch/README.md'],
  );
  assert.ok(fs.existsSync(path.join(dir, 'keel.policy.json')));
  const md = read(dir, 'CLAUDE.md');
  assert.equal(count(md, ARB_BEGIN), 1); assert.equal(count(md, ARB_END), 1);
  assert.equal(count(md, AUTH_BEGIN), 1); assert.equal(count(md, AUTH_END), 1);
  assert.match(md, /^## 0\. Two lanes, one router/m, 'router present');
  assert.match(md, /ELEVEN DANGER SURFACES/, 'eleven surfaces');
  assert.match(md, /Server enforces, not the UI/, 'LAWS present');
  assert.match(md, /^## \/review tripwires/m, 'tripwires present');
  assert.match(md, /^## Standing authorization \(Keel v3\)/m);
  assert.match(md, /^## Precedence \(Keel\)/m);
  assert.match(md, /the approver named in keel\.policy\.json/, 'starter policy has a placeholder approver');
  assert.ok(md.indexOf(ARB_BEGIN) < md.indexOf(AUTH_BEGIN), 'rules come before the authorization');
  assert.ok(hasArbiter(dir) && hasAuthorization(dir));
  assert.ok(r.next.some((n) => /edit keel\.policy\.json/.test(n)), 'placeholder policy → told to edit it');
  const standards = read(dir, 'CODING_STANDARDS.md');
  assert.ok(!standards.includes('<!--'), 'template comment stripped');
  assert.ok(!standards.includes('<Project>'), 'project name filled');
  assert.match(read(dir, 'CONTEXT.md'), /^# CONTEXT: keel-init-/m, 'name from the directory when no package.json');
});

test('init is idempotent: re-run refreshes the blocks, keeps house rules and scaffolds, and names the approver', () => {
  const dir = emptyRepo();
  write(dir, 'CLAUDE.md', '# Host\n\nHouse rules stay.\n');
  write(dir, 'package.json', JSON.stringify({ name: '@acme/widgets' }));
  init(dir);
  // The human fills the policy and their scaffolds.
  write(dir, 'keel.policy.json', `${JSON.stringify(BASE_POLICY, null, 2)}\n`);
  write(dir, 'DESIGN.md', '# my tokens\n');
  fs.appendFileSync(path.join(dir, 'CLAUDE.md'), '\nA line added after the blocks.\n');
  const r = init(dir);
  assert.equal(r.policy, 'kept');
  assert.equal(r.arbiter, 'replaced');
  assert.equal(r.authorization, 'replaced');
  assert.deepEqual(r.scaffolded, []);
  assert.ok(r.skipped.includes('DESIGN.md'));
  assert.equal(read(dir, 'DESIGN.md'), '# my tokens\n', 'existing file untouched');
  const md = read(dir, 'CLAUDE.md');
  assert.match(md, /^House rules stay\.$/m);
  assert.match(md, /^A line added after the blocks\.$/m);
  assert.equal(count(md, ARB_BEGIN), 1, 'one rules block');
  assert.equal(count(md, AUTH_BEGIN), 1, 'one authorization block');
  assert.equal((md.match(/Server enforces, not the UI/g) ?? []).length, 1, 'LAWS once');
  assert.match(md, /@owner-human reviews and approves/, 'authorization names the approver after the policy is filled');
  assert.ok(!r.next.some((n) => /edit keel\.policy\.json/.test(n)), 'no placeholder left → no edit prompt');
  assert.match(read(dir, 'CONTEXT.md'), /^# CONTEXT: widgets$/m, 'scope stripped from the package name');
});

test('an older install.sh block (old marker text) is replaced, not duplicated', () => {
  const dir = emptyRepo();
  const old = '# >>> keel-v2 arbiter (managed by keel/install.sh) — do not edit between markers >>>\n' +
    'old router text\n# <<< keel-v2 arbiter <<<\n';
  write(dir, 'CLAUDE.md', `# Host\n\n${old}`);
  syncArbiter(dir);
  const md = read(dir, 'CLAUDE.md');
  assert.ok(!md.includes('old router text'));
  assert.ok(!md.includes('managed by keel/install.sh'));
  assert.equal(count(md, ARB_BEGIN), 1);
});

test('compile keeps the authorization block in step with the policy, and notes when it is missing', () => {
  const dir = emptyRepo();
  init(dir);
  write(
    dir, 'keel.policy.json', `${JSON.stringify({ ...BASE_POLICY, protectedBranches: ['main', 'release'] }, null, 2)}\n`,
  );
  const { notes } = compile(dir, { write: true });
  assert.match(read(dir, 'CLAUDE.md'), /never push to main, release/);
  assert.ok(!notes.some((n) => /standing-authorization/.test(n)));
  const bare = emptyRepo();
  write(bare, 'keel.policy.json', `${JSON.stringify(BASE_POLICY, null, 2)}\n`);
  const r2 = compile(bare, { write: true });
  assert.ok(r2.notes.some((n) => /no Keel standing-authorization block/.test(n)));
  assert.ok(!fs.existsSync(path.join(bare, 'CLAUDE.md')), 'compile never creates CLAUDE.md on its own');
});

test('doctor reports the rules and authorization blocks (advisory)', () => {
  const dir = emptyRepo();
  write(dir, 'keel.policy.json', `${JSON.stringify(BASE_POLICY, null, 2)}\n`);
  compile(dir, { write: true });
  const before = doctor(dir, { offline: true, pluginList: () => [{ name: 'keel@keel', enabled: true }] });
  assert.equal(before.find((i) => i.id === 'rules').status, 'MISSING');
  assert.equal(before.find((i) => i.id === 'authorization').status, 'MISSING');
  assert.ok(before.filter((i) => ['rules', 'authorization'].includes(i.id)).every((i) => i.required === false));
  init(dir, { scaffold: false });
  const after = doctor(dir, { offline: true, pluginList: () => [{ name: 'keel@keel', enabled: true }] });
  assert.equal(after.find((i) => i.id === 'rules').status, 'OK');
  assert.equal(after.find((i) => i.id === 'authorization').status, 'OK');
  assert.ok(!fs.existsSync(path.join(dir, 'DESIGN.md')), '--no-scaffold writes no project files');
});

test('the CLI: keel init → compile → doctor on a throwaway repo', () => {
  const dir = emptyRepo();
  const run = (...a) =>
    execFileSync(process.execPath, [CLI, ...a, '--dir', dir], { encoding: 'utf8', env: { ...process.env } });
  const out = run('init', '--name', 'Demo');
  assert.match(out, /\+ keel\.policy\.json written/);
  assert.match(out, /\+ CLAUDE\.md: keel-v2 router \+ LAWS block added/);
  assert.match(out, /\+ DESIGN\.md scaffolded/);
  assert.match(read(dir, 'GLOSSARY.md'), /^# Demo — Glossary/m);
  assert.match(run('init'), /= keel\.policy\.json kept/);
  assert.match(run('compile'), /Wrote:/);
  assert.ok(fs.existsSync(path.join(dir, '.keel/policy.lock.json')));
});
