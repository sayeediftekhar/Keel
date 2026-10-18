// The quality floor: the checks `keel compile` adds to the keel-checks job after
// the project's own ladder (D17-D19: audit, secret scan, SAST, architecture) and
// the clean-code limits ratchet (D20e), plus the files those checks read:
// .keel/ci/limits.mjs, .keel/ci/eslint.limits.mjs and .keel/ci/modules.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALITY_PINS } from './policy.mjs';
import { LIMIT_NAMES } from '../ci/limits.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CI_SCRIPT_SRC = path.join(HERE, '..', 'ci', 'keel-ci.mjs');
export const CI_SCRIPT_DST = '.keel/ci/keel-ci.mjs';
export const LIMITS_SRC = path.join(HERE, '..', 'ci', 'limits.mjs');
export const LIMITS_DST = '.keel/ci/limits.mjs';
export const ESLINT_LIMITS = '.keel/ci/eslint.limits.mjs';
export const MODULES = '.keel/ci/modules.json';

const exists = (projectDir, f) => fs.existsSync(path.join(projectDir, f));

export function packageManager(projectDir) {
  const has = (f) => exists(projectDir, f);
  if (!has('package.json')) return null;
  if (['bun.lock', 'bun.lockb', 'deno.lock'].some(has)) {
    return 'other'; // no npm-compatible audit; set quality.audit.command
  }
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return has('.yarnrc.yml') ? 'yarn-berry' : 'yarn';
  return has('package-lock.json') ? 'npm' : 'npm-unlocked';
}

export const indent = (s, n) => s.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');

// ------------------------------------------------------- quality floor ----
// D17: checks every governed project gets after its own ladder. Each returns a
// step (or null when its mode is off) and the notes `keel compile` prints.
const ZERO_SHA = '0000000000000000000000000000000000000000';
const DIFF_ENV = 'env:\n' +
  '  BASE_SHA: ${{ github.event.pull_request.base.sha }}\n' +
  '  HEAD_SHA: ${{ github.event.pull_request.head.sha }}\n' +
  '  BEFORE_SHA: ${{ github.event.before }}';
// yarn audit exits with a bitmask: 2 low … 16 critical
const YARN_CLASSIC_MASK = { low: 30, moderate: 28, high: 24, critical: 16 };
const DEPCRUISE_CONFIGS = [
  '.dependency-cruiser.js', '.dependency-cruiser.cjs', '.dependency-cruiser.mjs', '.dependency-cruiser.json',
];

function qualityStep(name, mode, body) {
  return `- name: ${name}${mode === 'warn' ? '\n  continue-on-error: true' : ''}\n${indent(body, 2)}`;
}
const runBlock = (cmd) => `run: |\n${indent(cmd, 2)}`;

function auditStep(projectDir, q) {
  if (q.mode === 'off') return { step: null, notes: [] };
  const pm = packageManager(projectDir);
  const cmd = q.command ?? {
    npm: `npm audit --audit-level=${q.level}`,
    'npm-unlocked': `npm audit --audit-level=${q.level}`,
    pnpm: `pnpm audit --audit-level ${q.level}`,
    'yarn-berry': `yarn npm audit --all --recursive --severity ${q.level}`,
    yarn: `code=0; yarn audit --level ${q.level} || code=$?\n` +
      '# yarn classic exits with a severity bitmask (2 low, 4 moderate, 8 high, 16 critical)\n' +
      `test $((code & ${YARN_CLASSIC_MASK[q.level]})) -eq 0`,
  }[pm];
  if (!cmd) {
    return {
      step: qualityStep('quality / dependency audit', 'warn', runBlock(
        'echo "::warning::No dependency audit: no npm, pnpm or Yarn lockfile here. ' +
          'Set quality.audit.command for this stack (bun audit, pip-audit, govulncheck, cargo audit, ...)."',
      )),
      notes: [
        'quality.audit: no npm, pnpm or Yarn lockfile and no quality.audit.command, so CI audits no dependencies. ' +
          'Set the command for this stack.',
      ],
    };
  }
  return {
    step: qualityStep(
      `quality / dependency audit (${q.command ? 'custom' : pm.replace('-unlocked', '')}, ${q.level}+)`,
      q.mode,
      runBlock(cmd),
    ),
    notes: [],
  };
}

function secretsStep(q) {
  if (q.mode === 'off') return { step: null, notes: [] };
  if (q.engine === 'builtin') {
    return {
      step: qualityStep(
        'quality / secret scan of the diff', q.mode, `${DIFF_ENV}\n${runBlock(`node ${CI_SCRIPT_DST} secrets`)}`,
      ),
      notes: [],
    };
  }
  const { version: v, sha256 } = q.gitleaks;
  const bin = '"$RUNNER_TEMP/gitleaks"';
  const cmd = [
    'curl -sSfL -o "$RUNNER_TEMP/gitleaks.tar.gz" ' +
      `https://github.com/gitleaks/gitleaks/releases/download/v${v}/gitleaks_${v}_linux_x64.tar.gz`,
    `echo "${sha256}  $RUNNER_TEMP/gitleaks.tar.gz" | sha256sum -c -`,
    'tar -xzf "$RUNNER_TEMP/gitleaks.tar.gz" -C "$RUNNER_TEMP" gitleaks',
    'range=""',
    'if [ -n "$BASE_SHA" ]; then range="$BASE_SHA..$HEAD_SHA"',
    `elif [ -n "$BEFORE_SHA" ] && [ "$BEFORE_SHA" != ${ZERO_SHA} ]; then range="$BEFORE_SHA..$GITHUB_SHA"; fi`,
    `if [ -n "$range" ]; then ${bin} git --no-banner --redact --log-opts="$range" .`,
    `else ${bin} git --no-banner --redact .; fi ` +
      '# first push: every commit (tracked files only, not the installed node_modules)',
  ].join('\n');
  return {
    step: qualityStep(`quality / secret scan (gitleaks ${v})`, q.mode, `${DIFF_ENV}\n${runBlock(cmd)}`),
    notes: [],
  };
}

function sastRules(projectDir, q) {
  if (q.rules) return q.rules;
  const has = (f) => exists(projectDir, f);
  const out = [];
  if (has('package.json')) out.push('javascript', 'typescript');
  if (['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'].some(has)) out.push('python');
  if (has('go.mod')) out.push('go');
  if (has('Gemfile')) out.push('ruby');
  if (has('Cargo.toml')) out.push('rust');
  if (has('Dockerfile')) out.push('dockerfile');
  return out;
}

function sastStep(projectDir, q) {
  if (q.mode === 'off') return { step: null, notes: [] };
  const rules = sastRules(projectDir, q);
  const own = ['.semgrep.yml', '.semgrep.yaml', '.semgrep'].filter((f) => exists(projectDir, f));
  if (!rules.length && !own.length) {
    return {
      step: qualityStep('quality / SAST', 'warn', runBlock(
        'echo "::warning::SAST is on but no stack was detected: ' +
          'set quality.sast.rules (semgrep-rules directories such as python, go)."',
      )),
      notes: ['quality.sast: no stack detected and no quality.sast.rules, so semgrep has no rules to run.'],
    };
  }
  const configs = [
    ...rules.map((r) => `--config "$RUNNER_TEMP/semgrep-rules/${r}"`),
    ...own.map((f) => `--config "$GITHUB_WORKSPACE/${f}"`),
  ];
  // A clean worktree of the commit under test: the ladder's build output and installs don't
  // count as changes, and --baseline-commit (PRs, pushes) reports only new findings.
  const cmd = [
    'git init -q "$RUNNER_TEMP/semgrep-rules"',
    'git -C "$RUNNER_TEMP/semgrep-rules" fetch -q --depth 1 ' +
      `https://github.com/semgrep/semgrep-rules ${QUALITY_PINS.semgrepRules}`,
    'git -C "$RUNNER_TEMP/semgrep-rules" checkout -q FETCH_HEAD',
    'git worktree add -q --detach "$RUNNER_TEMP/sast-src" HEAD',
    'base="${BASE_SHA:-$BEFORE_SHA}"; baseline=""',
    `if [ -n "$base" ] && [ "$base" != ${ZERO_SHA} ]; then baseline="--baseline-commit=$base"; fi`,
    'cd "$RUNNER_TEMP/sast-src"',
    `pipx run --spec semgrep==${QUALITY_PINS.semgrep} semgrep scan --metrics=off --disable-version-check --error ` +
      '${baseline:+"$baseline"} \\',
    `  ${configs.join(' ')}`,
  ].join('\n');
  return {
    step: qualityStep(`quality / SAST (semgrep ${QUALITY_PINS.semgrep})`, q.mode, `${DIFF_ENV}\n${runBlock(cmd)}`),
    notes: [],
  };
}

function architectureStep(projectDir, q) {
  if (q.mode === 'off') return { step: null, notes: [] };
  const has = (f) => exists(projectDir, f);
  const config = q.config ?? DEPCRUISE_CONFIGS.find(has);
  if (!config) {
    return {
      step: qualityStep('quality / architecture rules', 'warn', runBlock(
        'echo "::notice::No dependency-cruiser config, so no architecture rules are checked. ' +
          'Add one (npx dependency-cruiser --init) and run keel compile."',
      )),
      notes: [
        'quality.architecture: no dependency-cruiser config (.dependency-cruiser.cjs, …), ' +
          'so CI checks no architecture rules. Write the rules (npx dependency-cruiser --init), then recompile.',
      ],
    };
  }
  const paths = q.paths ?? (['src', 'lib', 'app', 'packages'].filter(has).length
    ? ['src', 'lib', 'app', 'packages'].filter(has)
    : ['.']);
  const cmd = `npx --yes dependency-cruiser@${QUALITY_PINS.dependencyCruiser} --config ${config} ` +
    `--output-type err ${paths.join(' ')}`;
  return {
    step: qualityStep(
      `quality / architecture rules (dependency-cruiser ${QUALITY_PINS.dependencyCruiser})`, q.mode, runBlock(cmd),
    ),
    notes: [],
  };
}

const limitsOn = (L) => LIMIT_NAMES.some((k) => L[k].mode !== 'off');

// D20e: one step; keel-ci.mjs decides per limit whether a finding warns or fails.
function limitsStep(L) {
  if (!limitsOn(L)) return { step: null, notes: [] };
  const run = runBlock(`node ${CI_SCRIPT_DST} limits`);
  const step = qualityStep('quality / clean-code limits (changed files only)', 'fail', `${DIFF_ENV}\n${run}`);
  return { step, notes: [] };
}

/** The quality floor's workflow steps, in order, and the notes for `keel compile`. */
export function qualityFloor(projectDir, policy) {
  const q = policy.quality;
  const parts = [
    auditStep(projectDir, q.audit), secretsStep(q.secrets), sastStep(projectDir, q.sast),
    architectureStep(projectDir, q.architecture), limitsStep(q.limits),
  ];
  return {
    steps: parts.map((p) => p.step).filter(Boolean),
    notes: parts.flatMap((p) => p.notes),
    needsHistory: q.secrets.mode !== 'off' || q.sast.mode !== 'off' || limitsOn(q.limits),
  };
}

// ------------------------------------------------- files the checks read ----

const ARCHITECTURE_FILES = ['docs/ARCHITECTURE.md', 'ARCHITECTURE.md'];
const MODULE_PATH = /^[A-Za-z0-9._/*-]+$/;
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const stabilityOf = (cell) => {
  if (/volatile/i.test(cell ?? '')) return 'volatile';
  return /stable/i.test(cell ?? '') ? 'stable' : null;
};

/** Pure: the module map table of an ARCHITECTURE.md → [{name, path, stability}]. Rows still holding
 *  template placeholders (<src/module/**>) or without a stable/volatile answer are skipped. */
export function moduleMap(text) {
  const lines = String(text ?? '').split('\n');
  const at = lines.findIndex((l) => /^\s*\|/.test(l) && /\bmodule\b/i.test(l) && /\bpath\b/i.test(l));
  if (at < 0) return [];
  const head = cells(lines[at]).map((c) => c.toLowerCase());
  const [name, where, kind] = [/^module/, /^path/, /stable|volatile/].map((re) => head.findIndex((c) => re.test(c)));
  const out = [];
  for (const line of lines.slice(at + 2)) {
    if (!/^\s*\|/.test(line)) break;
    const c = cells(line);
    const p = (c[where] ?? '').replace(/`/g, '');
    const stability = stabilityOf(c[kind]);
    if (!stability || !MODULE_PATH.test(p) || p.split('/').includes('..')) continue;
    out.push({ name: c[name], path: p, stability });
  }
  return out;
}

function readModuleMap(projectDir) {
  const file = ARCHITECTURE_FILES.find((f) => exists(projectDir, f));
  return file ? { file, modules: moduleMap(fs.readFileSync(path.join(projectDir, file), 'utf8')) } : null;
}

/** The ESLint flat config a project can extend: Keel's four limits as ESLint built-in rules, as warnings. */
export function eslintLimitsConfig(L) {
  const rule = (k, options) => [L[k].mode === 'off' ? 'off' : 'warn', options];
  const rules = {
    'max-lines': rule('fileLines', { max: L.fileLines.max, skipBlankLines: false, skipComments: false }),
    'max-lines-per-function': rule('functionLines', { max: L.functionLines.max, skipBlankLines: false,
      skipComments: false }),
    'max-len': rule('lineLength', { code: L.lineLength.max, tabWidth: 1 }),
    complexity: rule('complexity', { max: L.complexity.max }),
  };
  return [
    '// Generated by `keel compile` from keel.policy.json quality.limits; do not edit.',
    '// Extend it from your own eslint.config.* to see the limits in your editor:',
    "//   import keelLimits from './.keel/ci/eslint.limits.mjs';",
    '//   export default [...yourConfig, ...keelLimits];',
    '// CI checks the same caps as a ratchet on changed files (keel-ci.mjs limits).',
    'export default [',
    '  {',
    "    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'],",
    `    rules: ${JSON.stringify(rules, null, 2).replace(/\n/g, '\n    ')},`,
    '  },',
    '];',
    '',
  ].join('\n');
}

const PRETTIER_CONFIGS = ['.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs',
  '.prettierrc.yaml', '.prettierrc.yml', 'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs'];
const FORMATTERS = [
  { when: (has) => has('biome.json') || has('biome.jsonc'), command: 'node_modules/.bin/biome format --write' },
  { when: (has, read) => PRETTIER_CONFIGS.some(has) || /"prettier"\s*:/.test(read('package.json')),
    command: 'node_modules/.bin/prettier --write --ignore-unknown' },
  { when: (has, read) => has('ruff.toml') || has('.ruff.toml') || /^\[tool\.ruff/m.test(read('pyproject.toml')),
    command: 'ruff format' },
  { when: (has) => has('go.mod'), command: 'gofmt -w' },
];

/** The command the format hook runs on each file the agent writes (D20e-c): the policy's, else detected. */
export function formatterFor(projectDir, L) {
  if (L.formatter !== null) return L.formatter || null; // false: no formatter
  const has = (f) => exists(projectDir, f);
  const read = (f) => { try { return fs.readFileSync(path.join(projectDir, f), 'utf8'); } catch { return ''; } };
  return FORMATTERS.find((f) => f.when(has, read))?.command ?? null;
}

/** Files under .keel/ci/ the compiled checks read. */
export function qualityFiles(projectDir, policy) {
  const files = {
    [CI_SCRIPT_DST]: fs.readFileSync(CI_SCRIPT_SRC, 'utf8'),
    [LIMITS_DST]: fs.readFileSync(LIMITS_SRC, 'utf8'),
  };
  if (exists(projectDir, 'package.json')) files[ESLINT_LIMITS] = eslintLimitsConfig(policy.quality.limits);
  const map = readModuleMap(projectDir);
  if (map?.modules.length) files[MODULES] = `${JSON.stringify({ source: map.file, modules: map.modules }, null, 2)}\n`;
  return files;
}

