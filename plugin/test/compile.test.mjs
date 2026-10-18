import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeRepo, BASE_POLICY, write } from './helpers.mjs';
import { compile, denyRules, rulesetJson, workflowYaml, qualityFloor } from '../lib/compile.mjs';
import { normalizePolicy, PolicyError, QUALITY_PINS } from '../lib/policy.mjs';
import { moduleMap } from '../lib/quality.mjs';
import { formatCommand } from '../lib/format.mjs';

test('policy validation rejects an agent holding the approval stamp', () => {
  assert.throws(() => normalizePolicy({ ...BASE_POLICY, agentIdentity: { github: 'owner-human' } }), PolicyError);
  // GitHub logins are case-insensitive, so this is the same account.
  assert.throws(() => normalizePolicy({ ...BASE_POLICY, agentIdentity: { github: 'Owner-Human' } }), PolicyError);
});

test('policy validation rejects unknown keys and bad modes', () => {
  assert.throws(() => normalizePolicy({ ...BASE_POLICY, gatez: {} }), /unknown key "gatez"/);
  assert.throws(() => normalizePolicy({ ...BASE_POLICY, gates: { merge: { agent: 'yolo' } } }), /gates\.merge\.agent/);
  assert.throws(() => normalizePolicy({ ...BASE_POLICY, backPressure: ['lint'] }), /checks\.lint/);
});

test('policy validation reports prototype-named quality keys as unknown, not a crash', () => {
  // JSON.parse, as for a real keel.policy.json: "__proto__" becomes an own key, not the prototype.
  for (const k of ['constructor', 'toString', '__proto__']) {
    const quality = JSON.parse(`{"${k}": {"mode": "warn"}}`);
    assert.throws(() => normalizePolicy({ ...BASE_POLICY, quality }), (e) => e instanceof PolicyError
      && e.message.includes(`unknown key "quality.${k}"`));
    const limits = JSON.parse(`{"${k}": 5}`);
    assert.throws(() => normalizePolicy({ ...BASE_POLICY, quality: { limits } }), (e) => e instanceof PolicyError
      && e.message === `unknown key "quality.limits.${k}"`);
  }
});

test('compile writes every target and the lock', () => {
  const { dir } = makeRepo();
  for (const f of [
    '.keel/policy.lock.json', '.claude/settings.json', '.github/CODEOWNERS', '.github/workflows/keel.yml',
    '.keel/ci/keel-ci.mjs', '.keel/github-ruleset.json',
  ]) {
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
  for (const r of [
    'Bash(printenv DATABASE_URL)', 'Bash(git push origin main)', 'mcp__github__merge_pull_request',
    'Bash(vercel --prod:*)', 'Edit(./keel.policy.json)',
  ]) {
    assert.ok(rules.includes(r), r);
  }
});

test('no Write(path) deny rules: Claude Code only honors Edit(path) for file tools', () => {
  // Found in a live run on Claude Code 2.1.296, which warned and ignored them.
  const rules = denyRules(normalizePolicy(BASE_POLICY));
  assert.ok(!rules.some((r) => r.startsWith('Write(')));
});

test('ruleset: code-owner review, both keel checks, no bypass, no force push', () => {
  const rs = rulesetJson(normalizePolicy(BASE_POLICY));
  assert.deepEqual(rs.bypass_actors, []);
  assert.equal(rs.enforcement, 'active');
  assert.ok(rs.rules.find((r) => r.type === 'pull_request').parameters.require_code_owner_review);
  assert.deepEqual(
    rs.rules.find((r) => r.type === 'required_status_checks').parameters.required_status_checks.map((c) => c.context),
    ['keel-checks', 'keel-rigor'],
  );
  assert.ok(rs.rules.some((r) => r.type === 'non_fast_forward'));
});

test('workflow runs the back-pressure ladder and the rigor check, with PR body and author passed via env', () => {
  const { dir } = makeRepo({ ...BASE_POLICY, ci: { postgres: true } });
  write(dir, 'package-lock.json', '{}');
  compile(dir, { write: true });
  const y = fs.readFileSync(path.join(dir, '.github/workflows/keel.yml'), 'utf8');
  assert.match(y, /name: keel-checks/);
  assert.match(y, /- name: install\n\s+run: \|\n\s+npm ci/);
  assert.match(y, /- name: unit\n\s+run: \|\n\s+npm test/);
  assert.match(y, /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/);
  assert.match(y, /PR_AUTHOR: \$\{\{ github\.event\.pull_request\.user\.login \}\}/);
  assert.ok(!/run:.*github\.event\.pull_request\./.test(y), 'PR body/author never interpolated into a shell line');
  assert.match(y, /image: postgres:16/);
});

// ------------------------------------------------------- quality floor ----
const keelChecks = (y) => y.slice(y.indexOf('  keel-checks:'), y.indexOf('  keel-rigor:'));
const stepNames = (y) => [...keelChecks(y).matchAll(/^ {6}- (?:name: (.+)|uses: (.+))$/gm)].map((m) => m[1] ?? m[2]);
function fixture(files = {}, quality) {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'keel-q-'));
  for (const [rel, content] of Object.entries(files)) write(dir, rel, content);
  return { dir, policy: normalizePolicy({ ...BASE_POLICY, ...(quality ? { quality } : {}) }) };
}

test('quality defaults: a project compiled with defaults gets audit + secret scan after its ladder, ' +
  'nothing else to set up', () => {
  const { dir } = makeRepo();
  write(dir, 'package-lock.json', '{}');
  const { files, notes } = compile(dir);
  const y = files['.github/workflows/keel.yml'];
  assert.deepEqual(stepNames(y), ['actions/checkout@v4', 'actions/setup-node@v4', 'install', 'unit',
    'quality / dependency audit (npm, high+)', 'quality / secret scan of the diff', 'quality / architecture rules',
    'quality / clean-code limits (changed files only)']);
  assert.match(
    keelChecks(y), /- uses: actions\/checkout@v4\n\s+with:\n\s+fetch-depth: 0/, 'the diff scan needs history',
  );
  assert.match(y, /- name: quality \/ dependency audit \(npm, high\+\)\n\s+run: \|\n\s+npm audit --audit-level=high\n/);
  assert.match(y, new RegExp(
    String.raw`- name: quality \/ secret scan of the diff\n\s+env:\n` +
    String.raw`\s+BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\n\s+HEAD_SHA: .*\n` +
    String.raw`\s+BEFORE_SHA: \$\{\{ github\.event\.before \}\}\n\s+run: \|\n` +
    String.raw`\s+node \.keel\/ci\/keel-ci\.mjs secrets\n`,
  ));
  assert.ok(
    !/continue-on-error/.test(y.split('quality / architecture')[0]), 'fail mode: audit and secrets fail the job',
  );
  assert.ok(!/semgrep/.test(y), 'SAST is opt-in');
  assert.ok(notes.some((n) => /no dependency-cruiser config/.test(n)), 'missing architecture rules are noted');
  const lock = JSON.parse(files['.keel/policy.lock.json']);
  assert.deepEqual(lock.policy.quality.threatModel, { mode: 'warn' });
  assert.equal(lock.policy.quality.secrets.gitleaks.sha256, QUALITY_PINS.gitleaks.sha256);
});

test('quality audit follows the lockfile, and the level maps per package manager', () => {
  const cases = [
    [{ 'package.json': '{}', 'pnpm-lock.yaml': '' }, 'pnpm audit --audit-level critical', 'pnpm'],
    [
      { 'package.json': '{}', 'yarn.lock': '', '.yarnrc.yml': '' },
      'yarn npm audit --all --recursive --severity critical',
      'yarn-berry',
    ],
    [{ 'package.json': '{}', 'yarn.lock': '' }, 'yarn audit --level critical || code=$?', 'yarn'],
  ];
  for (const [files, cmd, label] of cases) {
    const { dir, policy } = fixture(files, { audit: { level: 'critical' } });
    const y = workflowYaml(dir, policy);
    assert.ok(y.includes(cmd), `${label}: ${cmd}`);
    assert.ok(y.includes(`quality / dependency audit (${label}, critical+)`), label);
  }
  const { dir, policy } = fixture({ 'package.json': '{}', 'yarn.lock': '' });
  assert.match(workflowYaml(dir, policy), /test \$\(\(code & 24\)\) -eq 0/, 'yarn classic: high = the 8 and 16 bits');
});

test('quality audit: no JavaScript → a warning step and a note; a custom command replaces detection', () => {
  const bare = fixture({ 'requirements.txt': 'flask\n' });
  const y = workflowYaml(bare.dir, bare.policy);
  assert.match(y, new RegExp(
    String.raw`- name: quality \/ dependency audit\n\s+continue-on-error: true\n\s+run: \|\n` +
    String.raw`\s+echo "::warning::No dependency audit`,
  ));
  assert.ok(qualityFloor(bare.dir, bare.policy).notes.some((n) => /quality\.audit/.test(n)));
  const custom = fixture(
    { 'requirements.txt': 'flask\n' },
    { audit: { command: 'pipx run --spec pip-audit==2.9.0 pip-audit -r requirements.txt' } },
  );
  const yc = workflowYaml(custom.dir, custom.policy);
  assert.match(
    yc, /- name: quality \/ dependency audit \(custom, high\+\)\n\s+run: \|\n\s+pipx run --spec pip-audit==2\.9\.0/,
  );
  assert.equal(qualityFloor(custom.dir, custom.policy).notes.filter((n) => /quality\.audit/.test(n)).length, 0);
  const bun = fixture({ 'package.json': '{}', 'bun.lockb': '' });
  assert.ok(
    !workflowYaml(bun.dir, bun.policy).includes('npm audit'),
    'npm audit needs package-lock.json; Bun gets the warning instead',
  );
});

test('quality policy: explicit nulls mean "use the default", as the schema allows', () => {
  const p = normalizePolicy({
    ...BASE_POLICY,
    quality: { audit: { command: null }, sast: { rules: null }, architecture: { config: null, paths: null } },
  });
  assert.equal(p.quality.audit.command, null);
  assert.equal(p.quality.architecture.paths, null);
});

test('quality modes: off drops the step, warn keeps it but lets the job pass', () => {
  const { dir, policy } = fixture({ 'package.json': '{}', 'package-lock.json': '{}' },
    { audit: { mode: 'off' }, secrets: { mode: 'warn' }, architecture: { mode: 'off' }, limits: { mode: 'off' } });
  const y = workflowYaml(dir, policy);
  assert.deepEqual(stepNames(y).filter((n) => n.startsWith('quality')), ['quality / secret scan of the diff']);
  assert.match(y, /- name: quality \/ secret scan of the diff\n\s+continue-on-error: true\n/);
  const none = fixture(
    { 'package.json': '{}' },
    { audit: { mode: 'off' }, secrets: { mode: 'off' }, architecture: { mode: 'off' }, limits: { mode: 'off' } },
  );
  const yn = workflowYaml(none.dir, none.policy);
  assert.ok(!/quality \//.test(yn));
  assert.ok(!keelChecks(yn).includes('fetch-depth'), 'no history fetch when nothing scans the diff');
});

test('quality secrets: gitleaks is downloaded at the pinned version and checked against its sha256 ' +
  'before it runs', () => {
  const { dir, policy } = fixture({}, { secrets: { engine: 'gitleaks' } });
  const y = workflowYaml(dir, policy);
  const { version, sha256 } = QUALITY_PINS.gitleaks;
  const dl = y.indexOf(`releases/download/v${version}/gitleaks_${version}_linux_x64.tar.gz`);
  const check = y.indexOf(`echo "${sha256}  $RUNNER_TEMP/gitleaks.tar.gz" | sha256sum -c -`);
  const run = y.indexOf('"$RUNNER_TEMP/gitleaks" git --no-banner --redact --log-opts="$range" .');
  assert.ok(!y.includes('gitleaks" dir'), 'never scans the installed node_modules');
  assert.ok(dl > 0 && check > dl && run > check, 'download → verify → run');
  assert.ok(y.includes('range="$BASE_SHA..$HEAD_SHA"'), 'a PR scans only its own commits');
});

test('quality sast: opt-in semgrep pinned twice (tool + rules commit), stack-detected rules, ' +
  'the project\'s own rules, new findings only', () => {
  const { dir, policy } = fixture(
    { 'package.json': '{}', 'go.mod': 'module x\n', '.semgrep.yml': 'rules: []\n' },
    { sast: { mode: 'fail' } },
  );
  const y = workflowYaml(dir, policy);
  assert.ok(y.includes(`pipx run --spec semgrep==${QUALITY_PINS.semgrep} semgrep scan --metrics=off`));
  assert.ok(y.includes(`fetch -q --depth 1 https://github.com/semgrep/semgrep-rules ${QUALITY_PINS.semgrepRules}`));
  for (const r of ['javascript', 'typescript', 'go']) assert.ok(
    y.includes(`--config "$RUNNER_TEMP/semgrep-rules/${r}"`), r,
  );
  assert.ok(!y.includes('semgrep-rules/python'));
  assert.ok(y.includes('--config "$GITHUB_WORKSPACE/.semgrep.yml"'));
  assert.ok(
    y.includes('baseline="--baseline-commit=$base"') &&
      y.includes('git worktree add -q --detach "$RUNNER_TEMP/sast-src" HEAD'),
  );
  assert.match(QUALITY_PINS.semgrep, /^\d+\.\d+\.\d+$/);
  assert.match(QUALITY_PINS.semgrepRules, /^[0-9a-f]{40}$/);
  const explicit = fixture({}, { sast: { mode: 'warn', rules: ['python'] } });
  assert.ok(workflowYaml(explicit.dir, explicit.policy).includes('semgrep-rules/python"'));
});

test('quality architecture: the project\'s dependency-cruiser config, pinned tool, existing source dirs', () => {
  const { dir, policy } = fixture({
    'package.json': '{}', '.dependency-cruiser.cjs': 'module.exports = {};', 'src/a.ts': '', 'lib/b.ts': '',
  });
  const y = workflowYaml(dir, policy);
  assert.ok(y.includes(
    `npx --yes dependency-cruiser@${QUALITY_PINS.dependencyCruiser} ` +
      '--config .dependency-cruiser.cjs --output-type err src lib',
  ));
  assert.equal(qualityFloor(dir, policy).notes.length, 0);
  const set = fixture({ 'deps.json': '{}' }, { architecture: { config: 'deps.json', paths: ['packages/api'] } });
  assert.ok(workflowYaml(set.dir, set.policy).includes('--config deps.json --output-type err packages/api'));
});

test('quality policy validation: unknown keys, bad modes, unpinned gitleaks, path escapes', () => {
  const bad = (quality, re) => assert.throws(() => normalizePolicy({ ...BASE_POLICY, quality }), re);
  bad({ lint: {} }, /unknown key "quality\.lint"/);
  bad({ audit: { mode: 'strict' } }, /quality\.audit\.mode must be one of fail, warn, off/);
  bad({ audit: { level: 'severe' } }, /quality\.audit\.level/);
  bad({ secrets: { engine: 'trufflehog' } }, /quality\.secrets\.engine/);
  bad({ secrets: { gitleaks: { version: '8.30.2' } } }, /sha256/);
  bad({ secrets: { gitleaks: { version: 'latest', sha256: 'a'.repeat(64) } } }, /quality\.secrets\.gitleaks/);
  bad({ sast: { rules: ['../../etc'] } }, /quality\.sast\.rules/);
  bad({ architecture: { config: '$(curl x)' } }, /quality\.architecture\.config/);
  bad({ threatModel: 'fail' }, /quality\.threatModel must be an object/);
  bad({ threatModel: { mode: 'fail', strict: true } }, /unknown key "quality\.threatModel\.strict"/);
  assert.equal(
    normalizePolicy({ ...BASE_POLICY, quality: { threatModel: { mode: 'fail' } } }).quality.threatModel.mode, 'fail',
  );
});

test('keel-rigor gets the branch name through env, never interpolated into the shell', () => {
  const { dir, policy } = fixture({});
  const y = workflowYaml(dir, policy);
  assert.match(y, /HEAD_REF: \$\{\{ github\.head_ref \}\}\n\s+run: node \.keel\/ci\/keel-ci\.mjs rigor/);
  assert.ok(!/run:.*github\.head_ref/.test(y));
});

// ------------------------------------------------- D20e clean-code limits ----

test('limits: one step after the floor, never continue-on-error (keel-ci decides warn vs fail); off drops it', () => {
  const { dir, policy } = fixture({ 'package.json': '{}' }, { limits: { mode: 'fail', lineLength: 100 } });
  const y = workflowYaml(dir, policy);
  const step = keelChecks(y).split('- name: quality / clean-code limits (changed files only)\n')[1];
  assert.ok(step, 'the limits step is compiled');
  assert.match(step, new RegExp(String.raw`^\s+env:\n\s+BASE_SHA: .*\n\s+HEAD_SHA: .*\n\s+BEFORE_SHA: .*\n`
    + String.raw`\s+run: \|\n\s+node \.keel\/ci\/keel-ci\.mjs limits\n`));
  assert.ok(!/continue-on-error/.test(step.split('- name:')[0]));
  assert.match(keelChecks(y), /fetch-depth: 0/, 'the ratchet compares against the base commit');
  const lock = normalizePolicy({ ...BASE_POLICY, quality: { limits: { mode: 'fail', lineLength: 100 } } });
  assert.deepEqual(lock.quality.limits.lineLength, { max: 100, mode: 'fail' });
  const off = fixture({}, { limits: { mode: 'off' } });
  assert.ok(!/clean-code limits/.test(workflowYaml(off.dir, off.policy)));
});

test('limits policy validation: caps, modes and the formatter (argv only, no shell)', () => {
  const bad = (limits) => () => normalizePolicy({ ...BASE_POLICY, quality: { limits } });
  assert.throws(bad({ fileLines: 0 }), /quality\.limits\.fileLines/);
  assert.throws(bad({ complexity: { max: 10, mode: 'block' } }), /quality\.limits\.complexity/);
  assert.throws(bad({ formatter: 'prettier --write; curl evil' }), /quality\.limits\.formatter/);
  assert.throws(bad({ sizes: 1 }), /unknown key "quality\.limits\.sizes"/);
  assert.doesNotThrow(bad({ formatter: false, exclude: ['gen/**'], boundaries: { mode: 'fail' } }));
});

test('compile writes the limits checker and an ESLint config a JS project can extend', async () => {
  const { dir } = makeRepo({ ...BASE_POLICY, quality: { limits: { functionLines: 60, complexity: { mode: 'off' } } } });
  const { files } = compile(dir);
  assert.ok(files['.keel/ci/limits.mjs'].includes('export async function main()'));
  const cfgFile = path.join(dir, '.keel/ci/eslint.limits.mjs');
  write(dir, '.keel/ci/eslint.limits.mjs', files['.keel/ci/eslint.limits.mjs']);
  const [cfg] = (await import(cfgFile)).default;
  assert.deepEqual(Object.keys(cfg.rules), ['max-lines', 'max-lines-per-function', 'max-len', 'complexity']);
  const perFunction = ['warn', { max: 60, skipBlankLines: false, skipComments: false }];
  assert.deepEqual(cfg.rules['max-lines-per-function'], perFunction);
  assert.equal(cfg.rules.complexity[0], 'off');
  const bare = fixture({});
  write(bare.dir, 'keel.policy.json', JSON.stringify(BASE_POLICY));
  assert.ok(!('.keel/ci/eslint.limits.mjs' in compile(bare.dir).files), 'no package.json → no ESLint config');
});

test('module map: docs/ARCHITECTURE.md rows become .keel/ci/modules.json; template rows are skipped', () => {
  const arch = (rows) => `# Architecture\n\n## Module map\n| Module | Path | Single job | Stable or volatile |\n`
    + `|---|---|---|---|\n${rows.join('\n')}\n\n## Iron Laws\n`;
  const template = '| <module> | <src/module/**> | <one-sentence job> | <stable or volatile> |';
  assert.deepEqual(moduleMap(arch([template])), []);
  const rows = ['| Billing | `src/billing/**` | Charges cards. | Stable |',
    '| UI | src/ui | Renders pages. | volatile |', '| Misc | src/misc | Does things. | ? |'];
  assert.deepEqual(moduleMap(arch(rows)), [
    { name: 'Billing', path: 'src/billing/**', stability: 'stable' },
    { name: 'UI', path: 'src/ui', stability: 'volatile' },
  ]);
  const { dir } = makeRepo(BASE_POLICY, { extraFiles: { 'docs/ARCHITECTURE.md': arch(rows) } });
  const map = JSON.parse(compile(dir).files['.keel/ci/modules.json']);
  assert.equal(map.source, 'docs/ARCHITECTURE.md');
  assert.equal(map.modules.length, 2);
});

test('formatter: detected into the lock (or the policy\'s, or none); the hook formats only project files', () => {
  const lockOf = (extra, limits) => {
    const { dir } = makeRepo({ ...BASE_POLICY, ...(limits ? { quality: { limits } } : {}) }, { extraFiles: extra });
    return JSON.parse(compile(dir).files['.keel/policy.lock.json']).formatter;
  };
  assert.equal(lockOf({ '.prettierrc': '{}' }), 'node_modules/.bin/prettier --write --ignore-unknown');
  assert.equal(lockOf({ 'go.mod': 'module x\n' }), 'gofmt -w');
  assert.equal(lockOf({ '.prettierrc': '{}' }, { formatter: false }), null);
  assert.equal(lockOf({}, { formatter: 'npx biome format --write' }), 'npx biome format --write');
  assert.equal(lockOf({}), null);
  const ev = (tool, file) => ({ tool_name: tool, tool_input: { file_path: file }, cwd: '/p' });
  assert.deepEqual(formatCommand(ev('Write', '/p/src/a.ts'), '/p', 'node_modules/.bin/prettier --write'),
    { file: '/p/node_modules/.bin/prettier', args: ['--write', 'src/a.ts'], cwd: '/p' });
  assert.equal(formatCommand(ev('Write', '/elsewhere/a.ts'), '/p', 'gofmt -w'), null, 'outside the project');
  assert.equal(formatCommand(ev('Read', '/p/a.ts'), '/p', 'gofmt -w'), null, 'reads change nothing');
  assert.equal(formatCommand(ev('Edit', '/p/.keel/ci/keel-ci.mjs'), '/p', 'gofmt -w'), null, 'generated files');
  assert.equal(formatCommand(ev('Edit', '/p/a.go'), '/p', null), null);
});
