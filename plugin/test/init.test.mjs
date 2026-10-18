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
import { estimateTokens } from '../ci/keel-ci.mjs';
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
  assert.deepEqual(r.scaffolded, [
    'CONTEXT.md', 'GLOSSARY.md', 'CODING_STANDARDS.md', 'DESIGN.md', 'LAWS.md', 'LEARNINGS.md',
    'docs/INDEX.md', 'docs/ARCHITECTURE.md', '.scratch/README.md',
  ]);
  assert.ok(fs.existsSync(path.join(dir, 'keel.policy.json')));
  const md = read(dir, 'CLAUDE.md');
  assert.equal(count(md, ARB_BEGIN), 1); assert.equal(count(md, ARB_END), 1);
  assert.equal(count(md, AUTH_BEGIN), 1); assert.equal(count(md, AUTH_END), 1);
  assert.match(md, /^Truth order: live system .* > code > docs\./m, 'truth order');
  assert.match(md, /scan the eleven danger surfaces/, 'lane rule');
  assert.match(md, /11 environment \(points at live\)/, 'eleven surface names');
  assert.match(md, /^ {4}Rigor: FAST — surfaces 1-11 scanned, all no\./m, 'FAST record line');
  assert.match(md, /^ {4}Rigor: HEAVY — surface\(s\) <n> = yes\./m, 'HEAVY record line');
  for (const inv of ['Server enforces, not the UI', 'Identity from the session, never the request',
    'Exact money', 'Immutable records', 'Live is gated, test is free']) assert.ok(md.includes(inv), inv);
  assert.match(md, /^\| Authority \| Path \| Governs \|$/m, 'authorities index');
  assert.equal(count(md, '@docs/INDEX.md'), 1, 'one docs index import');
  assert.ok(!/^## \/review tripwires/m.test(md) && !md.includes('ELEVEN DANGER SURFACES'),
    'definitions and tripwires are on demand (keel-v2 skill), not always on');
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
  assert.equal((md.match(/Server enforces, not the UI/g) ?? []).length, 1, 'rules once');
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
  assert.match(out, /\+ CLAUDE\.md: keel-v2 Tier-1 router block added/);
  assert.match(out, /\+ DESIGN\.md scaffolded/);
  assert.match(read(dir, 'GLOSSARY.md'), /^# Demo — Glossary/m);
  assert.match(run('init'), /= keel\.policy\.json kept/);
  assert.match(run('compile'), /Wrote:/);
  assert.ok(fs.existsSync(path.join(dir, '.keel/policy.lock.json')));
});

test('Tier-1 budget: a fresh init writes ≤ 80 lines and ≤ 1.5k tokens (est.) of always-on context', () => {
  const dir = emptyRepo();
  init(dir);
  const md = read(dir, 'CLAUDE.md');
  const withImport = md + read(dir, 'docs/INDEX.md');
  const lines = (s) => s.split('\n').length - 1;
  assert.ok(lines(withImport) <= 80, `CLAUDE.md + docs/INDEX.md is ${lines(withImport)} lines`);
  assert.ok(estimateTokens(withImport) <= 1500, `~${estimateTokens(withImport)} tokens (est.)`);
  assert.ok(md.split('\n').every((l) => l.length <= 120), 'no line hides content from a line budget');
});

test('the rules that left Tier 1 are on demand, verbatim, in the keel-v2 skill', () => {
  const skill = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'skills', 'keel-v2');
  const body = fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8');
  assert.match(body, /^name: keel-v2$/m);
  assert.ok(!/disable-model-invocation:\s*true/.test(body), 'model-invoked, so it loads when a task needs it');
  const laws = fs.readFileSync(path.join(skill, 'LAWS.md'), 'utf8');
  for (const s of ['## The eleven danger surfaces', '## Invariants', '## /review tripwires']) {
    assert.ok(laws.includes(s), s);
  }
  assert.match(body, /`LAWS\.md`/); assert.match(body, /`CLAUDE\.md`/);
});

test('a project that already imports docs/INDEX.md keeps one import', () => {
  const dir = emptyRepo();
  write(dir, 'CLAUDE.md', '# Host\n\n@docs/INDEX.md\n');
  init(dir);
  assert.equal(count(read(dir, 'CLAUDE.md'), '@docs/INDEX.md'), 1);
});

test('builder-stack scaffolds: architecture module map, LEARNINGS L1/L2, Iron Laws, docs index', () => {
  const dir = emptyRepo();
  init(dir, { name: 'Demo' });
  const arch = read(dir, 'docs/ARCHITECTURE.md');
  for (const h of ['## Load-bearing pieces', '## Module map', '## Sequencing plan', 'Phase 0']) {
    assert.ok(arch.includes(h), h);
  }
  assert.match(arch, /^\| Module \| Path \| Single job .* \| Stable or volatile \|$/m);
  const learn = read(dir, 'LEARNINGS.md');
  assert.match(learn, /^## L1 — Green tests aren't working software$/m);
  assert.match(learn, /^## L2 — Confirm facts, don't assume them$/m);
  assert.match(learn, /Truth order: live source > code > prose docs\./);
  assert.match(read(dir, 'LAWS.md'), /^# Iron Laws: Demo$/m);
  assert.match(read(dir, 'docs/INDEX.md'), /^\| Topic \| File \|$/m);
});
