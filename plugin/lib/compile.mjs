// keel compile: one policy file → every enforcement point that lives in the repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readPolicyFile, buildLock, LOCK_FILE, QUALITY_PINS } from './policy.mjs';
import { hasAuthorization, syncAuthorization } from './init.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CI_SCRIPT_SRC = path.join(HERE, '..', 'ci', 'keel-ci.mjs');
export const CI_SCRIPT_DST = '.keel/ci/keel-ci.mjs';
export const WORKFLOW = '.github/workflows/keel.yml';
export const CODEOWNERS = '.github/CODEOWNERS';
export const SETTINGS = '.claude/settings.json';
export const RULESET = '.keel/github-ruleset.json';
export const RECEIPTS = '.keel/receipts.jsonl'; // local state, never committed
const CO_BEGIN = '# >>> keel (managed by `keel compile`; edit keel.policy.json instead) >>>';
const CO_END = '# <<< keel <<<';

/** Deny rules: the second enforcement layer, honored in every permission mode. */
export function denyRules(policy) {
  const g = policy.gates;
  const out = [];
  if (g.secrets.mode === 'block') {
    out.push('Bash(printenv)', 'Bash(env)');
    for (const m of policy.environments.live.markers) out.push(`Bash(printenv ${m})`);
    for (const f of ['.env', '.env.local', '.env.production', '.env.development']) out.push(`Read(./${f})`);
  }
  if (g.push.mode === 'block') {
    for (const b of policy.protectedBranches) {
      out.push(`Bash(git push origin ${b})`, `Bash(git push origin HEAD:${b})`, `Bash(git push --force origin ${b})`, `Bash(git push -f origin ${b})`);
    }
  }
  if (g.merge.agent !== 'allow') out.push('Bash(gh pr merge --admin:*)', 'mcp__github__merge_pull_request');
  if (g.deploy.mode === 'approver') for (const c of g.deploy.commands) out.push(`Bash(${c}:*)`);
  if (g.governance.mode === 'block') {
    for (const p of ['keel.policy.json', '.keel/policy.lock.json', '.claude/settings.json', '.claude/settings.local.json', '.github/CODEOWNERS', '.github/workflows/keel.yml']) {
      out.push(`Edit(./${p})`); // Edit(path) rules cover every file-editing tool; Write(path) rules are ignored
    }
  }
  return [...new Set(out)];
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function settingsJson(projectDir, policy, prevManaged) {
  const file = path.join(projectDir, SETTINGS);
  const existing = readJson(file, {});
  const managed = denyRules(policy);
  const keep = (existing.permissions?.deny ?? []).filter((r) => !prevManaged.includes(r) && !managed.includes(r));
  const allow = (existing.permissions?.allow ?? []);
  const next = { ...existing, permissions: { ...(existing.permissions ?? {}), deny: [...keep, ...managed] } };
  const risky = allow.filter((r) => /printenv|DATABASE_URL|git push|gh pr merge|git -C .* commit -m '\*'|commit -m '\*'/.test(r));
  return { content: `${JSON.stringify(next, null, 2)}\n`, managed, risky };
}

function codeownersBlock(policy) {
  const owner = `@${policy.approver.github}`;
  const lines = [CO_BEGIN, '# Danger paths: a PR touching these needs the approver\'s review (HEAVY).'];
  for (const [surface, globs] of Object.entries(policy.surfaces)) {
    for (const g of globs) lines.push(`/${g.replace(/^\.?\//, '')} ${owner}  # ${surface}`);
  }
  lines.push('# Governance files: the agent cannot weaken its own gates.');
  for (const g of policy.governancePaths.filter((p) => !p.startsWith('~/') && p !== RECEIPTS)) lines.push(`/${g} ${owner}`);
  lines.push('/.keel/approvals/ ' + owner, CO_END);
  return lines.join('\n');
}

function codeowners(projectDir, policy) {
  const file = path.join(projectDir, CODEOWNERS);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const block = codeownersBlock(policy);
  const start = existing.indexOf(CO_BEGIN);
  const end = existing.indexOf(CO_END);
  // Keel's block goes last: in CODEOWNERS the last matching line wins.
  const without = start >= 0 && end > start ? existing.slice(0, start) + existing.slice(end + CO_END.length) : existing;
  const head = without.replace(/\n{3,}/g, '\n\n').trim();
  return `${head ? `${head}\n\n` : ''}${block}\n`;
}

const exists = (projectDir, f) => fs.existsSync(path.join(projectDir, f));

function packageManager(projectDir) {
  const has = (f) => exists(projectDir, f);
  if (!has('package.json')) return null;
  if (['bun.lock', 'bun.lockb', 'deno.lock'].some(has)) return 'other'; // no npm-compatible audit; set quality.audit.command
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return has('.yarnrc.yml') ? 'yarn-berry' : 'yarn';
  return has('package-lock.json') ? 'npm' : 'npm-unlocked';
}

function installCommand(projectDir, policy) {
  if (policy.ci.install) return policy.ci.install;
  return { pnpm: 'corepack enable && pnpm install --frozen-lockfile', yarn: 'corepack enable && yarn install --frozen-lockfile',
    'yarn-berry': 'corepack enable && yarn install --frozen-lockfile', npm: 'npm ci', 'npm-unlocked': 'npm install', other: 'npm install' }[packageManager(projectDir)] ?? null;
}

const indent = (s, n) => s.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');

// ------------------------------------------------------- quality floor ----
// D17: checks every governed project gets after its own ladder. Each returns a
// step (or null when its mode is off) and the notes `keel compile` prints.
const ZERO_SHA = '0000000000000000000000000000000000000000';
const DIFF_ENV = 'env:\n  BASE_SHA: ${{ github.event.pull_request.base.sha }}\n  HEAD_SHA: ${{ github.event.pull_request.head.sha }}\n  BEFORE_SHA: ${{ github.event.before }}';
const YARN_CLASSIC_MASK = { low: 30, moderate: 28, high: 24, critical: 16 }; // yarn audit exits with a bitmask: 2 low … 16 critical
const DEPCRUISE_CONFIGS = ['.dependency-cruiser.js', '.dependency-cruiser.cjs', '.dependency-cruiser.mjs', '.dependency-cruiser.json'];

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
    yarn: `code=0; yarn audit --level ${q.level} || code=$?\n# yarn classic exits with a severity bitmask (2 low, 4 moderate, 8 high, 16 critical)\ntest $((code & ${YARN_CLASSIC_MASK[q.level]})) -eq 0`,
  }[pm];
  if (!cmd) {
    return { step: qualityStep('quality / dependency audit', 'warn', runBlock('echo "::warning::No dependency audit: no npm, pnpm or Yarn lockfile here. Set quality.audit.command for this stack (bun audit, pip-audit, govulncheck, cargo audit, ...)."')),
      notes: ['quality.audit: no npm, pnpm or Yarn lockfile and no quality.audit.command, so CI audits no dependencies. Set the command for this stack.'] };
  }
  return { step: qualityStep(`quality / dependency audit (${q.command ? 'custom' : pm.replace('-unlocked', '')}, ${q.level}+)`, q.mode, runBlock(cmd)), notes: [] };
}

function secretsStep(q) {
  if (q.mode === 'off') return { step: null, notes: [] };
  if (q.engine === 'builtin') return { step: qualityStep('quality / secret scan of the diff', q.mode, `${DIFF_ENV}\n${runBlock(`node ${CI_SCRIPT_DST} secrets`)}`), notes: [] };
  const { version: v, sha256 } = q.gitleaks;
  const bin = '"$RUNNER_TEMP/gitleaks"';
  const cmd = [
    `curl -sSfL -o "$RUNNER_TEMP/gitleaks.tar.gz" https://github.com/gitleaks/gitleaks/releases/download/v${v}/gitleaks_${v}_linux_x64.tar.gz`,
    `echo "${sha256}  $RUNNER_TEMP/gitleaks.tar.gz" | sha256sum -c -`,
    'tar -xzf "$RUNNER_TEMP/gitleaks.tar.gz" -C "$RUNNER_TEMP" gitleaks',
    'range=""',
    'if [ -n "$BASE_SHA" ]; then range="$BASE_SHA..$HEAD_SHA"',
    `elif [ -n "$BEFORE_SHA" ] && [ "$BEFORE_SHA" != ${ZERO_SHA} ]; then range="$BEFORE_SHA..$GITHUB_SHA"; fi`,
    `if [ -n "$range" ]; then ${bin} git --no-banner --redact --log-opts="$range" .`,
    `else ${bin} git --no-banner --redact .; fi # first push: every commit (tracked files only, not the installed node_modules)`,
  ].join('\n');
  return { step: qualityStep(`quality / secret scan (gitleaks ${v})`, q.mode, `${DIFF_ENV}\n${runBlock(cmd)}`), notes: [] };
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
    return { step: qualityStep('quality / SAST', 'warn', runBlock('echo "::warning::SAST is on but no stack was detected: set quality.sast.rules (semgrep-rules directories such as python, go)."')),
      notes: ['quality.sast: no stack detected and no quality.sast.rules, so semgrep has no rules to run.'] };
  }
  const configs = [...rules.map((r) => `--config "$RUNNER_TEMP/semgrep-rules/${r}"`), ...own.map((f) => `--config "$GITHUB_WORKSPACE/${f}"`)];
  // A clean worktree of the commit under test: the ladder's build output and installs don't
  // count as changes, and --baseline-commit (PRs, pushes) reports only new findings.
  const cmd = [
    'git init -q "$RUNNER_TEMP/semgrep-rules"',
    `git -C "$RUNNER_TEMP/semgrep-rules" fetch -q --depth 1 https://github.com/semgrep/semgrep-rules ${QUALITY_PINS.semgrepRules}`,
    'git -C "$RUNNER_TEMP/semgrep-rules" checkout -q FETCH_HEAD',
    'git worktree add -q --detach "$RUNNER_TEMP/sast-src" HEAD',
    'base="${BASE_SHA:-$BEFORE_SHA}"; baseline=""',
    `if [ -n "$base" ] && [ "$base" != ${ZERO_SHA} ]; then baseline="--baseline-commit=$base"; fi`,
    'cd "$RUNNER_TEMP/sast-src"',
    `pipx run --spec semgrep==${QUALITY_PINS.semgrep} semgrep scan --metrics=off --disable-version-check --error \${baseline:+"$baseline"} \\`,
    `  ${configs.join(' ')}`,
  ].join('\n');
  return { step: qualityStep(`quality / SAST (semgrep ${QUALITY_PINS.semgrep})`, q.mode, `${DIFF_ENV}\n${runBlock(cmd)}`), notes: [] };
}

function architectureStep(projectDir, q) {
  if (q.mode === 'off') return { step: null, notes: [] };
  const has = (f) => exists(projectDir, f);
  const config = q.config ?? DEPCRUISE_CONFIGS.find(has);
  if (!config) {
    return { step: qualityStep('quality / architecture rules', 'warn', runBlock('echo "::notice::No dependency-cruiser config, so no architecture rules are checked. Add one (npx dependency-cruiser --init) and run keel compile."')),
      notes: ['quality.architecture: no dependency-cruiser config (.dependency-cruiser.cjs, …), so CI checks no architecture rules. Write the rules (npx dependency-cruiser --init), then recompile.'] };
  }
  const paths = q.paths ?? (['src', 'lib', 'app', 'packages'].filter(has).length ? ['src', 'lib', 'app', 'packages'].filter(has) : ['.']);
  const cmd = `npx --yes dependency-cruiser@${QUALITY_PINS.dependencyCruiser} --config ${config} --output-type err ${paths.join(' ')}`;
  return { step: qualityStep(`quality / architecture rules (dependency-cruiser ${QUALITY_PINS.dependencyCruiser})`, q.mode, runBlock(cmd)), notes: [] };
}

/** The quality floor's workflow steps, in order, and the notes for `keel compile`. */
export function qualityFloor(projectDir, policy) {
  const q = policy.quality;
  const parts = [auditStep(projectDir, q.audit), secretsStep(q.secrets), sastStep(projectDir, q.sast), architectureStep(projectDir, q.architecture)];
  return {
    steps: parts.map((p) => p.step).filter(Boolean),
    notes: parts.flatMap((p) => p.notes),
    needsHistory: q.secrets.mode !== 'off' || q.sast.mode !== 'off',
  };
}

function compileWorkflow(projectDir, policy) {
  const quality = qualityFloor(projectDir, policy);
  return { yaml: renderWorkflow(projectDir, policy, quality), notes: quality.notes };
}

export function workflowYaml(projectDir, policy) {
  return compileWorkflow(projectDir, policy).yaml;
}

function renderWorkflow(projectDir, policy, quality) {
  const install = installCommand(projectDir, policy);
  const node = policy.ci.node;
  const steps = [
    quality.needsHistory ? '- uses: actions/checkout@v4\n  with:\n    fetch-depth: 0' : '- uses: actions/checkout@v4',
    `- uses: actions/setup-node@v4\n  with:\n    node-version: '${node}'`,
  ];
  if (install) steps.push(`- name: install\n  run: |\n${indent(install, 4)}`);
  for (const name of policy.backPressure) {
    steps.push(`- name: ${name}\n  run: |\n${indent(policy.checks[name], 4)}`);
  }
  if (!policy.backPressure.length) steps.push('- name: no checks configured\n  run: echo "::warning::keel.policy.json has no backPressure checks; this job proves nothing yet."');
  steps.push(...quality.steps);
  const services = policy.ci.postgres
    ? `    services:\n      postgres:\n        image: postgres:16\n        env:\n          POSTGRES_PASSWORD: postgres\n          POSTGRES_DB: app_test\n        ports: ['5432:5432']\n        options: >-\n          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10\n    env:\n      DATABASE_URL: postgres://postgres:postgres@localhost:5432/app_test\n`
    : '';
  const branches = policy.protectedBranches.map((b) => `'${b}'`).join(', ');
  return `# Generated by \`keel compile\` — do not edit. Change keel.policy.json and recompile.
name: keel
on:
  pull_request:
    types: [opened, synchronize, reopened, edited]
  pull_request_review:
    types: [submitted, dismissed]
  push:
    branches: [${branches}]
permissions:
  contents: read
  pull-requests: read
concurrency:
  group: keel-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  keel-checks:
    name: keel-checks
    runs-on: ubuntu-latest
    timeout-minutes: 30
${services}    steps:
${indent(steps.join('\n'), 6)}
  keel-rigor:
    name: keel-rigor
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '${node}'
      - name: rigor record matches the diff
        if: github.event_name == 'pull_request' || github.event_name == 'pull_request_review'
        env:
          GH_TOKEN: \${{ github.token }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
          PR_AUTHOR: \${{ github.event.pull_request.user.login }}
          PR_BODY: \${{ github.event.pull_request.body }}
          BASE_SHA: \${{ github.event.pull_request.base.sha }}
          HEAD_SHA: \${{ github.event.pull_request.head.sha }}
          HEAD_REF: \${{ github.head_ref }}
        run: node ${CI_SCRIPT_DST} rigor
      - name: always-on context budget
        run: node ${CI_SCRIPT_DST} budget
      - name: docs name only things that exist
        run: node ${CI_SCRIPT_DST} phantom
`;
}

export function rulesetJson(policy) {
  const include = policy.protectedBranches.map((b) => (b === policy.defaultBranch ? '~DEFAULT_BRANCH' : `refs/heads/${b}`));
  return {
    name: 'keel',
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include, exclude: [] } },
    bypass_actors: [],
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      { type: 'pull_request', parameters: {
        required_approving_review_count: 0,
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: true,
        require_last_push_approval: true,
        required_review_thread_resolution: false,
      } },
      { type: 'required_status_checks', parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: [{ context: 'keel-checks' }, { context: 'keel-rigor' }],
      } },
    ],
  };
}

function gitignore(projectDir) {
  const file = path.join(projectDir, '.gitignore');
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (existing.split('\n').some((l) => l.trim() === RECEIPTS)) return existing;
  return `${existing}${existing && !existing.endsWith('\n') ? '\n' : ''}# keel: migration receipts are local session state\n${RECEIPTS}\n`;
}

export function githubRepo(projectDir) {
  try {
    const url = execFileSync('git', ['-C', projectDir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = /github\.com[:/]([^/]+)\/([^/]+?)(\.git)?$/.exec(url);
    return m ? { owner: m[1], repo: m[2] } : null;
  } catch { return null; }
}

/** Build every output. With write:true, also write them. Returns {files, notes}. */
export function compile(projectDir, { write = false } = {}) {
  const policy = readPolicyFile(projectDir);
  const prevLock = readJson(path.join(projectDir, LOCK_FILE), null);
  const settings = settingsJson(projectDir, policy, prevLock?.managedDeny ?? []);
  const gh = policy.github ?? githubRepo(projectDir);
  const lock = { ...buildLock(policy), github: gh, managedDeny: settings.managed };
  const workflow = compileWorkflow(projectDir, policy);
  const files = {
    [LOCK_FILE]: `${JSON.stringify(lock, null, 2)}\n`,
    [SETTINGS]: settings.content,
    [CODEOWNERS]: codeowners(projectDir, policy),
    [WORKFLOW]: workflow.yaml,
    [CI_SCRIPT_DST]: fs.readFileSync(CI_SCRIPT_SRC, 'utf8'),
    [RULESET]: `${JSON.stringify(rulesetJson(policy), null, 2)}\n`,
    '.gitignore': gitignore(projectDir),
  };
  const notes = [];
  if (!Object.keys(policy.surfaces).length) notes.push('No danger paths in "surfaces": every PR will count as LIGHT and auto-merge on green.');
  if (!policy.backPressure.length) notes.push('No "backPressure" checks: the keel-checks job proves nothing until you add typecheck/test/build commands.');
  notes.push(...workflow.notes);
  if (settings.risky.length) notes.push(`.claude/settings.json pre-allows risky commands: ${settings.risky.join(', ')}. Deny rules win, but remove these allows.`);
  if (!gh) notes.push('No GitHub repository found (origin isn\'t on github.com and keel.policy.json has no "github"). Live-migration approvals are verified on GitHub, so live migrations will stay blocked.');
  const repoArg = gh ? `repos/${gh.owner}/${gh.repo}` : 'repos/<owner>/<repo>';
  notes.push(`A repo admin applies the ruleset once: gh api -X POST ${repoArg}/rulesets --input ${RULESET}`);
  if (write) {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(projectDir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
    }
    // The standing authorization names the approver and the protected branches; keep it in step with the policy.
    if (hasAuthorization(projectDir)) syncAuthorization(projectDir, policy);
  }
  if (!hasAuthorization(projectDir)) notes.push('CLAUDE.md has no Keel standing-authorization block: the agent will fall back to "stop on the branch, the human commits". Run `keel init` to add it (and the keel-v2 rules).');
  return { policy, files, notes };
}
