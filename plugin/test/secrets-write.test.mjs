// The secrets-write check: no credential literal goes into a file or a command.
// Fake credentials are assembled at run time so no key-shaped literal sits in
// the repository (Keel's own CI secret-scan would otherwise trip on it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide } from '../lib/gates.mjs';
import { normalizePolicy } from '../lib/policy.mjs';
import { makeRepo } from './helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, '..', 'hooks', 'gate.mjs');

const AWS = `AK${'IA'}ABCDEFGHIJKLMNOP`;
const SK = `sk-${'proj-'}abcdefghijklmnopqrstuvwxyz0123`;
const STRIPE = `sk_${'live_'}abcdefghijklmnop`;
const PEM = `-----BEGIN ${'RSA'} PRIVATE KEY-----`;
const SLACK = `xox${'b-'}123456789012-abcdefgh`;
const GHP = `ghp${'_'}${'a'.repeat(36)}`;
const GLPAT = `glpat${'-'}${'b'.repeat(20)}`;
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.abcdefghijklmnopqrstuvwxyz0123456789';

const policy = normalizePolicy({ version: 1, approver: { github: 'h' }, agentIdentity: { github: 'a[bot]' } });
const P = '/proj';
const ctx = { policy, projectDir: P, env: {
  currentBranch: () => 'feature/x', gitConfig: () => [], approvals: () => [], sha: () => null, receipts: () => [],
  migrationTreeMatchesDefault: () => true, pkgScripts: () => ({}), now: () => Date.now(), envVar: () => undefined,
  prismaUsesDirectUrl: () => false, realpath: (p) => p, ledgers: () => [], readFile: () => null } };
const run = (ev) => decide({ cwd: P, ...ev }, ctx);
const B = (c) => ({ tool_name: 'Bash', tool_input: { command: c } });
const W = (f, content) => ({ tool_name: 'Write', tool_input: { file_path: f, content } });
const E = (f, o, n) => ({ tool_name: 'Edit', tool_input: { file_path: f, old_string: o, new_string: n } });
const M = (f, edits) => ({ tool_name: 'MultiEdit', tool_input: { file_path: f, edits } });
const N = (f, src) => ({ tool_name: 'NotebookEdit', tool_input: { notebook_path: f, new_source: src } });

const blocks = (name, ev) => test(`blocks [secrets]: ${name}`, () => {
  const d = run(ev);
  assert.equal(d.allow, false, 'expected a block');
  assert.equal(d.gate, 'secrets', `blocked by ${d.gate}: ${d.reason}`);
});
const allows = (name, ev) => test(`allows: ${name}`, () => {
  const d = run(ev);
  assert.equal(d.allow, true, `blocked by ${d.gate}: ${d.reason}`);
});

blocks('Write source with an AWS key', W(`${P}/src/cfg.ts`, `const k = "${AWS}";`));
blocks('Edit adding an OpenAI-style key', E(`${P}/src/cfg.ts`, 'x', `key: ${SK}`));
blocks('Write a Stripe live key', W(`${P}/lib/pay.ts`, `Stripe("${STRIPE}")`));
blocks('Write a PEM block', W(`${P}/deploy/id_rsa`, `${PEM}\nMIIE...`));
blocks('Write a Slack token into docs', W(`${P}/docs/setup.md`, `token ${SLACK}`));
blocks('Edit adding a GitHub PAT', E(`${P}/.github/workflows/x.yml`, 'a', `token: ${GHP}`));
blocks('MultiEdit with a GitLab token in one edit', M(`${P}/src/a.ts`, [
  { old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: GLPAT },
]));
blocks('NotebookEdit with a key', N(`${P}/analysis.ipynb`, `key = "${AWS}"`));
blocks('a key into .env.example (tracked)', W(`${P}/.env.example`, `AWS_KEY=${AWS}`));
blocks('a key into .env.test (tracked)', W(`${P}/.env.test`, `AWS_KEY=${AWS}`));
blocks('echo a key into a file', B(`echo "${AWS}" > src/cfg.ts`));
blocks('a key as a curl header', B(`curl -H "Authorization: Bearer ${SK}" https://api.example.com`));
blocks('a key in a heredoc', B(`cat > src/cfg.ts <<EOF\nkey=${AWS}\nEOF`));
blocks('a key through sh -c', B(`sh -c 'echo ${GHP} > t'`));

allows('env var reference in source', W(`${P}/src/cfg.ts`, 'const k = process.env.STRIPE_KEY;'));
allows('a key written only to .env (local home)', W(`${P}/.env`, `AWS_KEY=${AWS}`));
allows('a key written only to .env.local', W(`${P}/.env.local`, `STRIPE_KEY=${STRIPE}`));
allows('a key written to .dev.vars', W(`${P}/.dev.vars`, `K=${SK}`));
allows('a public JWT-shaped anon key', W(`${P}/src/supabase.ts`, `anon = "${JWT}"`));
allows('AKIA with too few chars', W(`${P}/src/a.ts`, 'id = "AKIAEXAMPLE"'));
allows('sk- too short', W(`${P}/src/a.ts`, 'sk-test'));
allows('prose mentioning the prefixes', W(`${P}/docs/secrets.md`, 'Keys start with sk- or AKIA; never commit them.'));
allows('the word PRIVATE KEY without a PEM header', W(`${P}/docs/x.md`, 'rotate the private key yearly'));
allows('grep for a key shape in source', B('grep -rn "AKIA" src'));
allows('reading .env.example', B('cat .env.example'));

test('secrets gate off disables the write check', () => {
  const off = normalizePolicy({
    version: 1, approver: { github: 'h' }, agentIdentity: { github: 'a[bot]' }, gates: { secrets: { mode: 'off' } },
  });
  assert.equal(decide({ cwd: P, ...W(`${P}/src/a.ts`, AWS) }, { ...ctx, policy: off }).allow, true);
});

test('e2e: the real hook blocks a key into source and allows it into .env.local', () => {
  const { dir } = makeRepo();
  const gate = (ev) => spawnSync(process.execPath, [GATE], {
    input: JSON.stringify({ cwd: dir, ...ev }), env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8',
  });
  const r = gate(W(path.join(dir, 'src/cfg.ts'), `const k = "${AWS}";`));
  assert.equal(r.status, 2); assert.match(r.stderr, /\[secrets\].*credential/);
  assert.equal(gate(W(path.join(dir, '.env.local'), `AWS_KEY=${AWS}`)).status, 0);
  assert.equal(gate(W(path.join(dir, 'src/cfg.ts'), 'const k = process.env.AWS_KEY;')).status, 0);
});
