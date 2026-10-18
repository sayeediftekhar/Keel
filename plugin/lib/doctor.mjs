// keel doctor: prove the gates, don't just check they're configured.
//
// Statuses:
//   ENFORCED  a planted violation was blocked AND the allowed twin passed
//   OK        a configuration item matches what `keel compile` would produce
//   BROKEN    present but wrong (a planted violation got through, a hook is off…)
//   MISSING   not there
//   UNPROVEN  couldn't be observed from here (no GitHub access, live-only behavior)
//
// Pass 2 never executes anything real: it pipes synthetic PreToolUse events
// into the gate hook and reads the exit code.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadLock, readPolicyFile } from './policy.mjs';
import { compile, githubRepo, SETTINGS, CODEOWNERS, WORKFLOW, CI_SCRIPT_DST } from './compile.mjs';
import { hasArbiter, hasAuthorization } from './init.mjs';
import { plantedCases } from './planted.mjs';

export { plantedCases };

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GATE = path.join(HERE, '..', 'hooks', 'gate.mjs');
export const HOOKS_JSON = path.join(HERE, '..', 'hooks', 'hooks.json');

const item = (id, required, status, detail) => ({ id, required, status, detail });

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }

/** Run the gate with a synthetic event; returns {blocked, stderr}. */
export function probe(projectDir, event, gate = GATE) {
  const r = spawnSync(process.execPath, [gate], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: projectDir, ...event }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf8',
    timeout: 15000,
  });
  return {
    blocked: r.status === 2,
    ran: r.status === 0 || r.status === 2,
    status: r.status,
    stderr: (r.stderr ?? '').trim(),
  };
}

function provenGates(projectDir, policy, gateScript) {
  const out = [];
  for (const [gate, [mustBlock, mustPass]] of Object.entries(plantedCases(policy, projectDir))) {
    const leaks = mustBlock.filter((e) => !probe(projectDir, e, gateScript).blocked);
    const overblocks = mustPass.filter((e) => {
      const p = probe(projectDir, e, gateScript);
      return p.blocked || !p.ran;
    });
    if (!leaks.length && !overblocks.length) {
      out.push(item(
        `gate:${gate}`,
        true,
        'ENFORCED',
        `${mustBlock.length} planted violation(s) blocked, ${mustPass.length} allowed twin(s) passed`,
      ));
    } else {
      const show = (e) => e.tool_input.command ?? e.tool_name;
      out.push(item(`gate:${gate}`, true, 'BROKEN', [
        ...leaks.map((e) => `NOT blocked: ${show(e)}`),
        ...overblocks.map((e) => `wrongly blocked: ${show(e)}`),
      ].join('; ')));
    }
  }
  return out;
}

function sameFile(projectDir, rel, expected) {
  const abs = path.join(projectDir, rel);
  if (!fs.existsSync(abs)) return 'MISSING';
  return fs.readFileSync(abs, 'utf8') === expected ? 'OK' : 'BROKEN';
}

function defaultPluginList() {
  const r = spawnSync('claude', ['plugin', 'list', '--json'], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.error?.message || 'claude plugin list failed').trim().split('\n')[0]);
  }
  return JSON.parse(r.stdout || '[]');
}

function pluginInstalled(pluginList) {
  let list;
  try {
    list = pluginList();
  } catch (e) {
    return item('plugin-installed', true, 'UNPROVEN',
      `couldn't ask Claude Code which plugins are installed: ${e.message}`);
  }
  const entries = Array.isArray(list) ? list : Object.values(list ?? {}).flat();
  const keel = entries.find((e) => /^keel(@|$)/.test(String(e?.name ?? e?.id ?? e?.plugin ?? '')));
  if (!keel) {
    return item('plugin-installed', true, 'BROKEN',
      'the Keel plugin is not installed in Claude Code, so none of these hooks run. ' +
      'Install it: /plugin marketplace add sayeediftekhar/Keel, then /plugin install keel@keel');
  }
  if (keel.enabled === false) {
    return item('plugin-installed', true, 'BROKEN', 'the Keel plugin is installed but disabled');
  }
  return item('plugin-installed', true, 'OK', `Claude Code has ${keel.name ?? keel.id} enabled`);
}

function hooksEnabled(projectDir) {
  const files = [
    path.join(os.homedir(), '.claude', 'settings.json'),
    path.join(projectDir, '.claude', 'settings.json'),
    path.join(projectDir, '.claude', 'settings.local.json'),
  ];
  for (const f of files) {
    const s = readJson(f);
    if (!s) continue;
    if (s.disableAllHooks === true) {
      return item('hooks-enabled', true, 'BROKEN', `${f} sets disableAllHooks: true — every Keel gate is off`);
    }
    for (const [k, v] of Object.entries(s.enabledPlugins ?? {})) {
      if (/^keel(@|$)/.test(k) && v === false) {
        return item('hooks-enabled', true, 'BROKEN', `${f} disables the Keel plugin (${k})`);
      }
    }
  }
  return item('hooks-enabled', true, 'OK',
    'no settings file disables hooks or the Keel plugin (managed settings are not visible from here)');
}

function failClosed() {
  const h = readJson(HOOKS_JSON);
  const handlers = (h?.hooks?.PreToolUse ?? []).flatMap((m) => m.hooks ?? []);
  if (!handlers.length) return item('fail-closed', true, 'MISSING', 'plugin hooks.json has no PreToolUse gates');
  const open = handlers.filter((x) => x.onFailure !== 'block');
  return open.length
    ? item('fail-closed', true, 'BROKEN',
      `${open.length} gate hook(s) lack onFailure: "block" — a crash or timeout would let the action through`)
    : item('fail-closed', true, 'OK', `all ${handlers.length} gate hooks set onFailure: "block"`);
}

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', timeout: 20000 });
  return { ok: r.status === 0, out: r.stdout ?? '', err: `${r.stderr ?? ''}${r.error ? r.error.message : ''}` };
}

/** Does the ruleset apply to the default branch, and not exclude it? */
function coversDefault(rs, defaultBranch) {
  const inc = rs.conditions?.ref_name?.include ?? [];
  const exc = rs.conditions?.ref_name?.exclude ?? [];
  const names = ['~DEFAULT_BRANCH', '~ALL', `refs/heads/${defaultBranch}`];
  return inc.some((x) => names.includes(x))
    && !exc.some((x) => names.includes(x) || x.includes('*'));
}

/** An active ruleset on the default branch: code-owner review, keel-checks + keel-rigor, no force-push, no bypass. */
function rulesetEnforces(rs, policy) {
  const rules = rs.rules ?? [];
  const pr = rules.find((x) => x.type === 'pull_request')?.parameters;
  const checks = (rules.find((x) => x.type === 'required_status_checks')?.parameters?.required_status_checks ?? [])
    .map((c) => c.context);
  const covers = coversDefault(rs, policy.defaultBranch);
  return rs.enforcement === 'active' && covers && pr?.require_code_owner_review
    && rules.some((x) => x.type === 'non_fast_forward')
    && checks.includes('keel-checks') && checks.includes('keel-rigor') && !(rs.bypass_actors ?? []).length;
}

function rulesetItem(slug, policy) {
  const list = gh(['api', `${slug}/rulesets`]);
  if (!list.ok) {
    const upgrade = /upgrade|403|404/i.test(list.err)
      ? ' (private repos on GitHub Free cannot enforce rulesets or branch protection — ' +
        'upgrade the plan or make the repo public)'
      : '';
    return item('github-ruleset', true, 'UNPROVEN',
      `cannot read rulesets: ${list.err.trim().split('\n')[0]}${upgrade}`);
  }
  let good = null;
  for (const r of JSON.parse(list.out || '[]')) {
    const full = gh(['api', `${slug}/rulesets/${r.id}`]);
    if (!full.ok) continue;
    const rs = JSON.parse(full.out);
    if (rulesetEnforces(rs, policy)) {
      good = rs;
      break;
    }
  }
  return good
    ? item('github-ruleset', true, 'OK',
      `ruleset "${good.name}" is active: code-owner review, keel-checks + keel-rigor required, ` +
      'no force-push, no bypass actors')
    : item('github-ruleset', true, 'MISSING',
      'no active ruleset matches the policy. ' +
      `Apply it: gh api -X POST ${slug}/rulesets --input .keel/github-ruleset.json`);
}

function agentIdentityItem(slug, agent) {
  if (agent.endsWith('[bot]')) {
    return item('agent-identity', true, 'UNPROVEN',
      `${agent} is a GitHub App: confirm in the App's settings it has no Administration permission ` +
      'and is not a ruleset bypass actor');
  }
  const perm = gh(['api', `${slug}/collaborators/${agent}/permission`]);
  if (!perm.ok) {
    return item('agent-identity', true, 'UNPROVEN',
      `cannot read ${agent}'s permission: ${perm.err.trim().split('\n')[0]}`);
  }
  const p = JSON.parse(perm.out).permission;
  return p === 'admin'
    ? item('agent-identity', true, 'BROKEN',
      `${agent} is a repo admin and could bypass the ruleset; give it write access only`)
    : item('agent-identity', true, 'OK', `${agent} has "${p}" access (not admin)`);
}

function githubChecks(projectDir, policy, offline) {
  const repo = githubRepo(projectDir);
  const unproven = (why) => [
    item('github-ruleset', true, 'UNPROVEN', why),
    item('agent-identity', true, 'UNPROVEN', why),
  ];
  if (offline) return unproven('skipped (--offline)');
  if (!repo) return unproven('origin is not a GitHub remote');
  if (!gh(['--version']).ok) return unproven('GitHub CLI (gh) not installed');
  const slug = `repos/${repo.owner}/${repo.repo}`;
  const ruleset = rulesetItem(slug, policy);
  return [ruleset, agentIdentityItem(slug, policy.agentIdentity.github)];
}

function testDbGuard(projectDir, policy) {
  const guard = policy.environments.test.guardFile;
  const hasMigrations = policy.migrations.dirs.some((d) => fs.existsSync(path.join(projectDir, d)));
  if (!guard) {
    return hasMigrations
      ? item('test-db-guard', true, 'MISSING',
        'this project has migrations but no environments.test.guardFile: tests could run against a live database')
      : item('test-db-guard', false, 'OK', 'no migrations directory; not applicable');
  }
  const file = path.join(projectDir, guard);
  if (!fs.existsSync(file)) return item('test-db-guard', true, 'MISSING', `${guard} does not exist`);
  return fs.readFileSync(file, 'utf8').includes('keel-test-db-guard')
    ? item('test-db-guard', true, 'OK', `${guard} carries the keel-test-db-guard check`)
    : item('test-db-guard', true, 'BROKEN', `${guard} lacks the keel-test-db-guard check (see \`keel guard-snippet\`)`);
}

function denyRulesItem(projectDir, settings) {
  const lockJson = readJson(path.join(projectDir, '.keel/policy.lock.json'));
  const wanted = lockJson?.managedDeny ?? [];
  const deny = settings?.permissions?.deny ?? [];
  const absent = wanted.filter((r) => !deny.includes(r));
  return !settings ? item('deny-rules', true, 'MISSING', `${SETTINGS} not found`)
    : !wanted.length ? item('deny-rules', true, 'BROKEN', 'the lock records no Keel deny rules — run `keel compile`')
    : absent.length ? item('deny-rules', true, 'BROKEN', `${absent.length} Keel deny rule(s) missing from ${SETTINGS}`)
    : item('deny-rules', true, 'OK', `${wanted.length} deny rules present`);
}

/** CODEOWNERS, the workflow and the CI script, each against what `keel compile` would write. */
function compiledFileItems(projectDir, expected) {
  return [['codeowners', CODEOWNERS], ['workflow', WORKFLOW], ['ci-script', CI_SCRIPT_DST]].map(([id, rel]) => {
    const st = sameFile(projectDir, rel, expected[rel]);
    return item(id, true, st, st === 'OK' ? `${rel} matches the policy`
      : st === 'MISSING' ? `${rel} is missing — run \`keel compile\``
      : `${rel} differs from what the policy compiles to — run \`keel compile\``);
  });
}

function bypassModeItem(projectDir) {
  const bypassOff = [path.join(os.homedir(), '.claude', 'settings.json'), path.join(projectDir, SETTINGS)]
    .some((f) => readJson(f)?.permissions?.disableBypassPermissionsMode === 'disable');
  return bypassOff ? item('bypass-mode', false, 'OK', 'bypassPermissions mode is disabled')
    : item('bypass-mode', false, 'MISSING',
      'consider permissions.disableBypassPermissionsMode: "disable" ' +
      '(gates held in bypass mode in our live test, but removing the mode removes the question)');
}

export function doctor(projectDir, { offline = false, gate: gateScript = GATE, pluginList = defaultPluginList } = {}) {
  const items = [];
  let policy;
  try {
    policy = readPolicyFile(projectDir);
    items.push(item('policy', true, 'OK', 'keel.policy.json is valid'));
  } catch (e) {
    return [item('policy', true,
      fs.existsSync(path.join(projectDir, 'keel.policy.json')) ? 'BROKEN' : 'MISSING', e.message)];
  }

  const lock = loadLock(projectDir);
  items.push(lock.state === 'ok'
    ? item('lock', true, 'OK', '.keel/policy.lock.json matches the policy')
    : item('lock', true, 'BROKEN', lock.reason));

  const expected = compile(projectDir, { write: false }).files;
  const settings = readJson(path.join(projectDir, SETTINGS));
  items.push(denyRulesItem(projectDir, settings));
  items.push(...compiledFileItems(projectDir, expected));
  items.push(pluginInstalled(pluginList));
  items.push(hooksEnabled(projectDir));
  items.push(bypassModeItem(projectDir));
  items.push(item('mods', false, 'UNPROVEN',
    'Claude Code mods with a tool.check handler can override hook decisions unless hooks are in managed settings; ' +
    'review installed mods'));
  items.push(failClosed());
  if (lock.state === 'ok') items.push(...provenGates(projectDir, lock.policy, gateScript));
  else items.push(item('gates', true, 'UNPROVEN', 'fix the lock first; gates run in strict fallback mode until then'));
  items.push(...githubChecks(projectDir, policy, offline));
  items.push(testDbGuard(projectDir, policy));
  items.push(hasArbiter(projectDir) ? item('rules', false, 'OK', 'CLAUDE.md carries the keel-v2 Tier-1 router block')
    : item('rules', false, 'MISSING',
      'CLAUDE.md has no keel-v2 rules block (eleven surfaces, FAST/HEAVY) — run `keel init`; ' +
      'a project on the card-set Keel can ignore this line'));
  items.push(hasAuthorization(projectDir)
    ? item('authorization', false, 'OK', 'CLAUDE.md carries the standing authorization + precedence block')
    : item('authorization', false, 'MISSING',
      'no standing-authorization block in CLAUDE.md: FAST work will stop on the branch ' +
      'instead of opening an auto-merging PR — run `keel init`'));
  items.push(policy.backPressure.length
    ? item('back-pressure', false, 'OK', `CI runs: ${policy.backPressure.join(' → ')}`)
    : item('back-pressure', false, 'MISSING', 'no backPressure checks configured; keel-checks proves nothing yet'));
  items.push(item('live-only', false, 'UNPROVEN',
    'not testable offline: whether hooks fire for Workflow-tool agents. ' +
    '(A hook block holding in bypassPermissions mode was observed live on Claude Code 2.1.296.)'));
  return items;
}

export function exitCode(items, { allowUnproven = false } = {}) {
  const bad = items.filter((i) => i.required && !['OK', 'ENFORCED'].includes(i.status)
    && !(allowUnproven && i.status === 'UNPROVEN'));
  return bad.length ? 1 : 0;
}

export function formatReport(items) {
  const w = Math.max(...items.map((i) => i.id.length));
  return items
    .map((i) => `${i.status.padEnd(9)} ${i.id.padEnd(w)}  ${i.required ? '' : '(advisory) '}${i.detail}`)
    .join('\n');
}

