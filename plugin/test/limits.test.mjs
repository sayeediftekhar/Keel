// The clean-code limits through real ESLint (D20e): function complexity measured by ESLint's
// built-in rule, compared against the PR's base, moved code recognised. Needs the pinned ESLint,
// which the first `keel-ci.mjs limits` run installs (Keel's CI runs that step before the tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ESLINT_PIN } from '../ci/limits.mjs';
import { BASE_POLICY, makeRepo, write, commitAll, git } from './helpers.mjs';

const CI = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'ci', 'keel-ci.mjs');
const runLimits = (dir, env, ...args) => spawnSync(process.execPath, [CI, 'limits', ...args],
  { cwd: dir, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });

const eslintDir = path.join(process.env.RUNNER_TEMP || os.tmpdir(), `keel-eslint-${ESLINT_PIN}`);
const haveEslint = fs.existsSync(path.join(eslintDir, 'node_modules', 'eslint'));

test('e2e limits with ESLint: a function newly over the complexity cap fails; moving it does not', {
  skip: !haveEslint && `the pinned ESLint is installed by a first \`keel-ci.mjs limits\` run (${eslintDir})`,
}, () => {
  const quality = { limits: { mode: 'fail', complexity: 3 } };
  const { dir } = makeRepo({ ...BASE_POLICY, quality });
  const fn = (name) => `export function ${name}(a, b, c) {\n  if (a) return 1;\n  if (b) return 2;\n`
    + '  if (c) return 3;\n  return a && b ? 4 : 5;\n}\n';
  write(dir, 'src/a.mjs', fn('pick'));
  commitAll(dir, 'legacy complex function');
  git(dir, 'checkout', '-q', 'main'); git(dir, 'merge', '-q', 'feature/x'); git(dir, 'checkout', '-q', 'feature/x');
  const base = git(dir, 'rev-parse', 'main');
  const env = () => ({
    BASE_SHA: base, HEAD_SHA: git(dir, 'rev-parse', 'HEAD'), RUNNER_TEMP: path.dirname(eslintDir),
  });
  git(dir, 'mv', 'src/a.mjs', 'src/b.mjs');
  write(dir, 'src/b.mjs', `// moved\n${fn('pick')}`);
  commitAll(dir, 'move');
  let r = runLimits(dir, env());
  assert.equal(r.status, 0, r.stdout);
  write(dir, 'src/c.mjs', fn('choose'));
  commitAll(dir, 'new complex function');
  r = runLimits(dir, env());
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /::error file=src\/c\.mjs,line=1,title=keel complexity::/);
  assert.match(r.stdout, /'choose' has complexity 6 \(cap 3\)/);
});
