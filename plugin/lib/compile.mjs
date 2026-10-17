// keel compile: one policy file → every enforcement point that lives in the repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readPolicyFile, buildLock, LOCK_FILE } from './policy.mjs';
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

function installCommand(projectDir, policy) {
  if (policy.ci.install) return policy.ci.install;
  const has = (f) => fs.existsSync(path.join(projectDir, f));
  if (!has('package.json')) return null;
  if (has('pnpm-lock.yaml')) return 'corepack enable && pnpm install --frozen-lockfile';
  if (has('yarn.lock')) return 'corepack enable && yarn install --frozen-lockfile';
  if (has('package-lock.json')) return 'npm ci';
  return 'npm install';
}

const indent = (s, n) => s.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');

export function workflowYaml(projectDir, policy) {
  const install = installCommand(projectDir, policy);
  const node = policy.ci.node;
  const steps = [
    '- uses: actions/checkout@v4',
    `- uses: actions/setup-node@v4\n  with:\n    node-version: '${node}'`,
  ];
  if (install) steps.push(`- name: install\n  run: |\n${indent(install, 4)}`);
  for (const name of policy.backPressure) {
    steps.push(`- name: ${name}\n  run: |\n${indent(policy.checks[name], 4)}`);
  }
  if (!policy.backPressure.length) steps.push('- name: no checks configured\n  run: echo "::warning::keel.policy.json has no backPressure checks; this job proves nothing yet."');
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
          PR_BODY: \${{ github.event.pull_request.body }}
          BASE_SHA: \${{ github.event.pull_request.base.sha }}
          HEAD_SHA: \${{ github.event.pull_request.head.sha }}
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
  const files = {
    [LOCK_FILE]: `${JSON.stringify(lock, null, 2)}\n`,
    [SETTINGS]: settings.content,
    [CODEOWNERS]: codeowners(projectDir, policy),
    [WORKFLOW]: workflowYaml(projectDir, policy),
    [CI_SCRIPT_DST]: fs.readFileSync(CI_SCRIPT_SRC, 'utf8'),
    [RULESET]: `${JSON.stringify(rulesetJson(policy), null, 2)}\n`,
    '.gitignore': gitignore(projectDir),
  };
  const notes = [];
  if (!Object.keys(policy.surfaces).length) notes.push('No danger paths in "surfaces": every PR will count as LIGHT and auto-merge on green.');
  if (!policy.backPressure.length) notes.push('No "backPressure" checks: the keel-checks job proves nothing until you add typecheck/test/build commands.');
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
