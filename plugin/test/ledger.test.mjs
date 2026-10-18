// The ledger gate: gate boxes in .scratch/<feature>/00-status.md are human-only,
// and no product code is written while a HEAVY feature waits at a gate.
// Part 1 is the pure decision table; part 2 runs the real gate.mjs and
// `keel approve` against a real repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide } from '../lib/gates.mjs';
import { normalizePolicy } from '../lib/policy.mjs';
import { makeRepo, write } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, '..', 'hooks', 'gate.mjs');
const KEEL = path.join(HERE, '..', 'bin', 'keel.mjs');

const LEDGER_BLOCKED = `# Invoicing — Status

**Rigor:** HEAVY — surface 1 (value) + 3 (PII)
**Current phase:** 3 · Decompose   **Blocked on:** human approval (G3)

## Gates
- [x] G1 Align — approved 2026-10-01 by Ada: "yes"  (docs: 00-product.md)
- [x] G2 Spec  — approved 2026-10-02 by Ada: "ship it"  (docs: spec.md)
- [ ] G3 Plan  — awaiting approval  (docs: issues/)
- [ ] Ship     — not reached

## Slices
- [ ] 01 — invoice totals
`;
const LEDGER_OPEN = LEDGER_BLOCKED.replace('**Blocked on:** human approval (G3)', '**Blocked on:** nothing')
  .replace('- [ ] G3 Plan  — awaiting approval', '- [x] G3 Plan — approved 2026-10-03 by Ada: "go"');
const LEDGER_PAUSED = LEDGER_BLOCKED.replace('human approval (G3)', 'paused');
const LEDGER_FAST = LEDGER_BLOCKED.replace('**Rigor:** HEAVY', '**Rigor:** FAST');

// ------------------------------------------------------------ part 1: pure

const policy = normalizePolicy({ version: 1, approver: { github: 'h' }, agentIdentity: { github: 'a[bot]' } });
const P = '/proj';
const L = `${P}/.scratch/invoicing/00-status.md`;
const ctx = (ledgerText, over = {}) => ({
  policy, projectDir: P,
  env: {
    currentBranch: () => 'feature/x', gitConfig: () => [], approvals: () => [], sha: () => null, receipts: () => [],
    migrationTreeMatchesDefault: () => true, pkgScripts: () => ({}), now: () => Date.now(), envVar: () => undefined,
    prismaUsesDirectUrl: () => false, realpath: (p) => p,
    ledgers: () => (ledgerText === null ? [] : [{ rel: '.scratch/invoicing/00-status.md', text: ledgerText }]),
    readFile: (abs) => (abs === L ? ledgerText : null),
    ...over,
  },
});
const run = (ev, ledgerText = LEDGER_BLOCKED, over) => decide({ cwd: P, ...ev }, ctx(ledgerText, over));
const B = (c) => ({ tool_name: 'Bash', tool_input: { command: c } });
const E = (file_path, old_string, new_string) =>
  ({ tool_name: 'Edit', tool_input: { file_path, old_string, new_string } });
const W = (file_path, content) => ({ tool_name: 'Write', tool_input: { file_path, content } });
const M = (file_path, edits) => ({ tool_name: 'MultiEdit', tool_input: { file_path, edits } });

const expectBlock = (name, ev, ledger, gate = 'ledger', over) => test(`blocks: ${name}`, () => {
  const d = run(ev, ledger, over);
  assert.equal(d.allow, false, 'expected a block');
  assert.equal(d.gate, gate, `blocked by ${d.gate}: ${d.reason}`);
  assert.ok(d.reason.length > 20, 'carries an actionable reason');
});
const expectAllow = (name, ev, ledger, over) => test(`allows: ${name}`, () => {
  const d = run(ev, ledger, over);
  assert.equal(d.allow, true, `blocked by ${d.gate}: ${d.reason}`);
});

// Rule 1 — gate boxes are human-only
expectBlock('Edit flipping G3 to [x]', E(L, '- [ ] G3 Plan  — awaiting approval', '- [x] G3 Plan — approved'));
expectBlock('Edit flipping Ship', E(L, '- [ ] Ship     — not reached', '- [x] Ship — done'));
expectBlock('Edit with a capital X', E(L, '- [ ] G3 Plan', '- [X] G3 Plan'));
expectBlock('Write rewriting the ledger with G3 newly checked', W(L, LEDGER_OPEN));
expectBlock('MultiEdit sneaking a gate flip among slice edits', M(L, [
  { old_string: '- [ ] 01', new_string: '- [x] 01' }, { old_string: '- [ ] G3 Plan', new_string: '- [x] G3 Plan' },
]));
expectBlock('relative ledger path', E('.scratch/invoicing/00-status.md', '- [ ] G3 Plan', '- [x] G3 Plan'));
expectAllow('Edit ticking a slice', E(L, '- [ ] 01 — invoice totals', '- [x] 01 — invoice totals'));
expectAllow('Edit adding an open decision',
  E(L, '## Slices', '## Open decisions\n- rounding: needs human\n\n## Slices'));
expectAllow('Write re-emitting already-approved gates', W(L, LEDGER_BLOCKED));
expectAllow('Write of an approved ledger that already had G3 checked on disk',
  W(L, LEDGER_OPEN.replace('- [ ] 01', '- [x] 01')), LEDGER_OPEN);
expectAllow('a "G3" in prose, not a gate line',
  E(L, '## Open decisions', '## Open decisions\n- waiting on G3 approval from Ada'));
expectAllow('00-status.md outside the ledger dir is just a file',
  E(`${P}/docs/00-status.md`, '- [ ] G3', '- [x] G3'), LEDGER_OPEN);

// Rule 2 — no product code while a HEAVY feature waits at a gate
expectBlock('Write src while blocked on G3', W(`${P}/src/invoice.ts`, 'export const x = 1'));
expectBlock('Edit src while blocked on G3', E(`${P}/src/invoice.ts`, 'a', 'b'));
expectBlock('NotebookEdit while blocked',
  { tool_name: 'NotebookEdit', tool_input: { notebook_path: `${P}/analysis.ipynb` } });
expectAllow('ticket under .scratch while blocked', W(`${P}/.scratch/invoicing/issues/02-tax.md`, '# 02'));
expectAllow('spec.md (markdown) while blocked', W(`${P}/docs/spec.md`, '# spec'));
expectAllow('GLOSSARY.md while blocked', W(`${P}/GLOSSARY.md`, '# g'));
expectAllow('src once G3 is approved', W(`${P}/src/invoice.ts`, 'x'), LEDGER_OPEN);
expectAllow('src when the feature is paused', W(`${P}/src/invoice.ts`, 'x'), LEDGER_PAUSED);
expectAllow('FAST ledger never gates code', W(`${P}/src/invoice.ts`, 'x'), LEDGER_FAST);
expectAllow('no ledger, no gate', W(`${P}/src/invoice.ts`, 'x'), null);
expectAllow('file outside the project is not ours to gate', W('/elsewhere/x.ts', 'x'));
test('governance still wins over the ledger gate on a governed file', () => {
  const d = run(W(`${P}/.claude/settings.json`, '{}'), LEDGER_BLOCKED);
  assert.equal(d.gate, 'governance');
});

// Bash side
expectBlock('sed -i on the ledger', B(`sed -i 's/\\[ \\] G3/[x] G3/' .scratch/invoicing/00-status.md`));
expectBlock('redirect into the ledger', B('echo "- [x] G3 Plan" >> .scratch/invoicing/00-status.md'));
expectBlock('tee into the ledger', B('printf x | tee .scratch/invoicing/00-status.md'));
expectBlock('mv over the ledger', B('mv /tmp/new.md .scratch/invoicing/00-status.md'));
expectBlock('cp over the ledger after cd', B('cd .scratch/invoicing && cp /tmp/new.md 00-status.md'));
expectBlock('agent runs keel approve', B('keel approve invoicing G3 "ok"'));
expectBlock('agent runs keel.mjs approve via node', B('node plugin/bin/keel.mjs approve invoicing G3 "ok"'));
expectBlock('agent runs keel approve through sh -c', B("sh -c 'keel approve invoicing G3 ok'"));
expectAllow('cat the ledger', B('cat .scratch/invoicing/00-status.md'));
expectAllow('grep the ledger', B('grep Blocked .scratch/invoicing/00-status.md'));
expectAllow('keel doctor', B('keel doctor'));
expectAllow('keel batch status', B('node plugin/bin/keel.mjs batch status'));
expectAllow('sed -i on a ticket', B("sed -i 's/ready/done/' .scratch/invoicing/issues/01.md"));

test('gates.ledger.mode off disables both rules', () => {
  const off = normalizePolicy({
    version: 1, approver: { github: 'h' }, agentIdentity: { github: 'a[bot]' }, gates: { ledger: { mode: 'off' } },
  });
  const c = { ...ctx(LEDGER_BLOCKED), policy: off };
  assert.equal(decide({ cwd: P, ...E(L, '- [ ] G3 Plan', '- [x] G3 Plan') }, c).allow, true);
  assert.equal(decide({ cwd: P, ...W(`${P}/src/x.ts`, 'x') }, c).allow, true);
});
test('gates.ledger.dir moves the ledger root', () => {
  const p2 = normalizePolicy({
    version: 1, approver: { github: 'h' }, agentIdentity: { github: 'a[bot]' },
    gates: { ledger: { dir: 'work/features' } },
  });
  const c = {
    ...ctx(LEDGER_BLOCKED, { ledgers: () => [{ rel: 'work/features/inv/00-status.md', text: LEDGER_BLOCKED }] }),
    policy: p2,
  };
  assert.equal(
    decide({ cwd: P, ...E(`${P}/work/features/inv/00-status.md`, '- [ ] G3 Plan', '- [x] G3 Plan') }, c).gate, 'ledger',
  );
  assert.equal(
    decide({ cwd: P, ...E(L, '- [ ] G3 Plan', '- [x] G3 Plan') }, c).allow,
    true,
    'old dir is not a ledger under this policy',
  );
});

// --------------------------------------------------- part 2: end to end

function gate(dir, event) {
  const r = spawnSync(process.execPath, [GATE], {
    input: JSON.stringify({ cwd: dir, ...event }), env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8',
  });
  return { code: r.status, err: r.stderr };
}
const keel = (dir, ...a) => spawnSync(process.execPath, [KEEL, '--dir', dir, ...a], {
  cwd: dir, env: { ...process.env, KEEL_APPROVER: 'Ada' }, encoding: 'utf8',
});

test('e2e: the real hook holds the plan gate, keel approve releases it', () => {
  const { dir } = makeRepo();
  write(dir, '.scratch/invoicing/00-status.md', LEDGER_BLOCKED);
  const ledger = path.join(dir, '.scratch/invoicing/00-status.md');
  let r = gate(dir, W(path.join(dir, 'src/invoice.ts'), 'export const x = 1'));
  assert.equal(r.code, 2); assert.match(r.err, /\[ledger\].*Blocked on: human approval \(G3\)/);
  r = gate(dir, E(ledger, '- [ ] G3 Plan  — awaiting approval', '- [x] G3 Plan — approved'));
  assert.equal(r.code, 2); assert.match(r.err, /\[ledger\] gate G3/);
  r = gate(dir, B('keel approve invoicing G3 "ok"'));
  assert.equal(r.code, 2); assert.match(r.err, /run by the human/);
  assert.equal(
    gate(dir, W(path.join(dir, '.scratch/invoicing/issues/02.md'), '# 02')).code, 0, 'tickets stay editable',
  );
  assert.equal(
    gate(dir, E(ledger, '- [ ] 01 — invoice totals', '- [x] 01 — invoice totals')).code, 0, 'slices stay editable',
  );

  const a = keel(dir, 'approve', 'invoicing', 'G3', 'tickets look right');
  assert.equal(a.status, 0, a.stderr);
  const text = fs.readFileSync(ledger, 'utf8');
  assert.match(
    text, /^- \[x\] G3 Plan — approved \d{4}-\d{2}-\d{2} by Ada: "tickets look right"  \(docs: issues\/\)$/m,
  );
  assert.match(text, /\*\*Blocked on:\*\* nothing/);
  assert.match(text, /^- \[x\] G1 Align — approved 2026-10-01 by Ada: "yes"/m, 'other lines untouched');
  assert.match(text, /^- \[ \] Ship/m);
  assert.equal(
    gate(dir, W(path.join(dir, 'src/invoice.ts'), 'export const x = 1')).code, 0, 'code flows once approved',
  );
  assert.equal(gate(dir, W(ledger, text)).code, 0, 'rewriting the approved ledger as-is is fine');

  const again = keel(dir, 'approve', 'invoicing', 'G3', 'again');
  assert.equal(again.status, 0); assert.match(again.stdout, /already approved/);
  assert.equal(keel(dir, 'approve', 'invoicing', 'G9', 'x').status, 2, 'bad gate name');
  assert.equal(keel(dir, 'approve', 'nope', 'G1', 'x').status, 1, 'missing ledger');
});

test('e2e: a broken lock still gates the ledger (strict fallback keeps mode=block)', () => {
  const { dir } = makeRepo();
  write(dir, '.scratch/invoicing/00-status.md', LEDGER_BLOCKED);
  fs.rmSync(path.join(dir, '.keel/policy.lock.json'));
  assert.equal(gate(dir, W(path.join(dir, 'src/x.ts'), 'x')).code, 2);
});
