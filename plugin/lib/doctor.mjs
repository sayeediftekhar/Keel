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
  return { blocked: r.status === 2, ran: r.status === 0 || r.status === 2, status: r.status, stderr: (r.stderr ?? '').trim() };
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });

/** Planted violations per gate: [shouldBlock[], shouldPass[]]. */
export function plantedCases(policy, projectDir) {
  const g = policy.gates;
  const b0 = policy.protectedBranches[0];
  const marker = policy.environments.live.markers[0];
  const liveProject = policy.environments.live.supabaseProjectIds[0] ?? 'keel-doctor-unknown-project';
  const testProject = policy.environments.test.supabaseProjectIds[0];
  const probeSql = `-- keel doctor probe ${Date.now()}\nDROP TABLE keel_doctor_probe;`;
  const abs = (rel) => path.join(projectDir, rel);
  const cases = {};
  if (g.push.mode === 'block') cases.push = [[bash(`git push origin ${b0}`), bash(`git push origin HEAD:${b0}`), { tool_name: 'mcp__github__push_files', tool_input: { branch: b0 } }], [bash('git push origin keel-doctor/probe')]];
  if (g.merge.agent !== 'allow') cases.merge = [[bash('gh pr merge 1 --squash'), bash('gh pr merge 1 --auto --admin'), { tool_name: 'mcp__github__merge_pull_request', tool_input: { pullNumber: 1 } }], g.merge.agent === 'auto-merge-only' ? [bash('gh pr merge 1 --auto --squash')] : []];
  if (g.migration.live !== 'allow') {
    cases.migration = [[
      { tool_name: 'mcp__supabase__apply_migration', tool_input: { project_id: liveProject, name: 'keel_doctor_probe', query: probeSql } },
      ...(g.migration.liveSql !== 'allow' ? [{ tool_name: 'mcp__supabase__execute_sql', tool_input: { project_id: liveProject, query: 'UPDATE keel_doctor_probe SET x = 1' } }] : []),
    ], testProject ? [{ tool_name: 'mcp__supabase__apply_migration', tool_input: { project_id: testProject, name: 'probe', query: 'select 1' } }] : []];
  }
  if (g.secrets.mode === 'block') cases.secrets = [[...(marker ? [bash(`printenv ${marker}`)] : []), bash('printenv'), { tool_name: 'Read', tool_input: { file_path: abs('.env') } }], [bash('printenv HOME')]];
  if (g.governance.mode === 'block') cases.governance = [[{ tool_name: 'Edit', tool_input: { file_path: abs('keel.policy.json') } }, { tool_name: 'Write', tool_input: { file_path: abs('.claude/settings.json') } }, bash('rm -f .keel/policy.lock.json')], [{ tool_name: 'Edit', tool_input: { file_path: abs('src/keel-doctor-probe.ts') } }]];
  if (g.deploy.mode === 'approver' && g.deploy.commands.length) cases.deploy = [[bash(g.deploy.commands[0])], [bash('echo deploy')]];
  if (g.ledger.mode === 'block') {
    const ledger = abs(`${g.ledger.dir}/keel-doctor-probe/00-status.md`);
    cases.ledger = [[
      { tool_name: 'Edit', tool_input: { file_path: ledger, old_string: '- [ ] G3 Plan — awaiting approval', new_string: '- [x] G3 Plan — approved' } },
      { tool_name: 'Write', tool_input: { file_path: ledger, content: '# Probe — Status\n\n**Rigor:** HEAVY\n\n## Gates\n- [x] Ship — approved\n' } },
      bash(`keel approve keel-doctor-probe G3 "probe"`),
      bash(`sed -i 's/\\[ \\] G3/[x] G3/' ${g.ledger.dir}/keel-doctor-probe/00-status.md`),
    ], [
      { tool_name: 'Edit', tool_input: { file_path: ledger, old_string: '- [ ] 01 — totals', new_string: '- [x] 01 — totals' } },
      bash(`cat ${g.ledger.dir}/keel-doctor-probe/00-status.md`),
    ]];
  }
  return cases;
}

function provenGates(projectDir, policy, gateScript) {
  const out = [];
  for (const [gate, [mustBlock, mustPass]] of Object.entries(plantedCases(policy, projectDir))) {
    const leaks = mustBlock.filter((e) => !probe(projectDir, e, gateScript).blocked);
    const overblocks = mustPass.filter((e) => { const p = probe(projectDir, e, gateScript); return p.blocked || !p.ran; });
    if (!leaks.length && !overblocks.length) {
      out.push(item(`gate:${gate}`, true, 'ENFORCED', `${mustBlock.length} planted violation(s) blocked, ${mustPass.length} allowed twin(s) passed`));
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
  if (r.status !== 0) throw new Error((r.stderr || r.error?.message || 'claude plugin list failed').trim().split('\n')[0]);
  return JSON.parse(r.stdout || '[]');
}

function pluginInstalled(pluginList) {
  let list;
  try { list = pluginList(); } catch (e) { return item('plugin-installed', true, 'UNPROVEN', `couldn't ask Claude Code which plugins are installed: ${e.message}`); }
  const entries = Array.isArray(list) ? list : Object.values(list ?? {}).flat();
  const keel = entries.find((e) => /^keel(@|$)/.test(String(e?.name ?? e?.id ?? e?.plugin ?? '')));
  if (!keel) return item('plugin-installed', true, 'BROKEN', 'the Keel plugin is not installed in Claude Code, so none of these hooks run. Install it: /plugin marketplace add sayeediftekhar/Keel, then /plugin install keel@keel');
  if (keel.enabled === false) return item('plugin-installed', true, 'BROKEN', 'the Keel plugin is installed but disabled');
  return item('plugin-installed', true, 'OK', `Claude Code has ${keel.name ?? keel.id} enabled`);
}

function hooksEnabled(projectDir) {
  const files = [path.join(os.homedir(), '.claude', 'settings.json'), path.join(projectDir, '.claude', 'settings.json'), path.join(projectDir, '.claude', 'settings.local.json')];
  for (const f of files) {
    const s = readJson(f);
    if (!s) continue;
    if (s.disableAllHooks === true) return item('hooks-enabled', true, 'BROKEN', `${f} sets disableAllHooks: true — every Keel gate is off`);
    for (const [k, v] of Object.entries(s.enabledPlugins ?? {})) {
      if (/^keel(@|$)/.test(k) && v === false) return item('hooks-enabled', true, 'BROKEN', `${f} disables the Keel plugin (${k})`);
    }
  }
  return item('hooks-enabled', true, 'OK', 'no settings file disables hooks or the Keel plugin (managed settings are not visible from here)');
}

function failClosed() {
  const h = readJson(HOOKS_JSON);
  const handlers = (h?.hooks?.PreToolUse ?? []).flatMap((m) => m.hooks ?? []);
  if (!handlers.length) return item('fail-closed', true, 'MISSING', 'plugin hooks.json has no PreToolUse gates');
  const open = handlers.filter((x) => x.onFailure !== 'block');
  return open.length
    ? item('fail-closed', true, 'BROKEN', `${open.length} gate hook(s) lack onFailure: "block" — a crash or timeout would let the action through`)
    : item('fail-closed', true, 'OK', `all ${handlers.length} gate hooks set onFailure: "block"`);
}

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', timeout: 20000 });
  return { ok: r.status === 0, out: r.stdout ?? '', err: `${r.stderr ?? ''}${r.error ? r.error.message : ''}` };
}

function githubChecks(projectDir, policy, offline) {
  const out = [];
  const repo = githubRepo(projectDir);
  const unproven = (why) => [
    item('github-ruleset', true, 'UNPROVEN', why),
    item('agent-identity', true, 'UNPROVEN', why),
  ];
  if (offline) return unproven('skipped (--offline)');
  if (!repo) return unproven('origin is not a GitHub remote');
  if (!gh(['--version']).ok) return unproven('GitHub CLI (gh) not installed');
  const slug = `repos/${repo.owner}/${repo.repo}`;
  const list = gh(['api', `${slug}/rulesets`]);
  if (!list.ok) {
    const upgrade = /upgrade|403|404/i.test(list.err) ? ' (private repos on GitHub Free cannot enforce rulesets or branch protection — upgrade the plan or make the repo public)' : '';
    out.push(item('github-ruleset', true, 'UNPROVEN', `cannot read rulesets: ${list.err.trim().split('\n')[0]}${upgrade}`));
  } else {
    let good = null;
    for (const r of JSON.parse(list.out || '[]')) {
      const full = gh(['api', `${slug}/rulesets/${r.id}`]);
      if (!full.ok) continue;
      const rs = JSON.parse(full.out);
      const rules = rs.rules ?? [];
      const pr = rules.find((x) => x.type === 'pull_request')?.parameters;
      const checks = (rules.find((x) => x.type === 'required_status_checks')?.parameters?.required_status_checks ?? []).map((c) => c.context);
      const inc = rs.conditions?.ref_name?.include ?? []; const exc = rs.conditions?.ref_name?.exclude ?? [];
      const names = ['~DEFAULT_BRANCH', '~ALL', `refs/heads/${policy.defaultBranch}`];
      const coversDefault = inc.some((x) => names.includes(x)) && !exc.some((x) => names.includes(x) || x.includes('*'));
      if (rs.enforcement === 'active' && coversDefault && pr?.require_code_owner_review && rules.some((x) => x.type === 'non_fast_forward')
        && checks.includes('keel-checks') && checks.includes('keel-rigor') && !(rs.bypass_actors ?? []).length) { good = rs; break; }
    }
    out.push(good
      ? item('github-ruleset', true, 'OK', `ruleset "${good.name}" is active: code-owner review, keel-checks + keel-rigor required, no force-push, no bypass actors`)
      : item('github-ruleset', true, 'MISSING', `no active ruleset matches the policy. Apply it: gh api -X POST ${slug}/rulesets --input .keel/github-ruleset.json`));
  }
  const agent = policy.agentIdentity.github;
  if (agent.endsWith('[bot]')) {
    out.push(item('agent-identity', true, 'UNPROVEN', `${agent} is a GitHub App: confirm in the App's settings it has no Administration permission and is not a ruleset bypass actor`));
  } else {
    const perm = gh(['api', `${slug}/collaborators/${agent}/permission`]);
    if (!perm.ok) out.push(item('agent-identity', true, 'UNPROVEN', `cannot read ${agent}'s permission: ${perm.err.trim().split('\n')[0]}`));
    else {
      const p = JSON.parse(perm.out).permission;
      out.push(p === 'admin'
        ? item('agent-identity', true, 'BROKEN', `${agent} is a repo admin and could bypass the ruleset; give it write access only`)
        : item('agent-identity', true, 'OK', `${agent} has "${p}" access (not admin)`));
    }
  }
  return out;
}

function testDbGuard(projectDir, policy) {
  const guard = policy.environments.test.guardFile;
  const hasMigrations = policy.migrations.dirs.some((d) => fs.existsSync(path.join(projectDir, d)));
  if (!guard) {
    return hasMigrations
      ? item('test-db-guard', true, 'MISSING', 'this project has migrations but no environments.test.guardFile: tests could run against a live database')
      : item('test-db-guard', false, 'OK', 'no migrations directory; not applicable');
  }
  const file = path.join(projectDir, guard);
  if (!fs.existsSync(file)) return item('test-db-guard', true, 'MISSING', `${guard} does not exist`);
  return fs.readFileSync(file, 'utf8').includes('keel-test-db-guard')
    ? item('test-db-guard', true, 'OK', `${guard} carries the keel-test-db-guard check`)
    : item('test-db-guard', true, 'BROKEN', `${guard} lacks the keel-test-db-guard check (see \`keel guard-snippet\`)`);
}

export function doctor(projectDir, { offline = false, gate: gateScript = GATE, pluginList = defaultPluginList } = {}) {
  const items = [];
  let policy;
  try { policy = readPolicyFile(projectDir); items.push(item('policy', true, 'OK', 'keel.policy.json is valid')); }
  catch (e) { return [item('policy', true, fs.existsSync(path.join(projectDir, 'keel.policy.json')) ? 'BROKEN' : 'MISSING', e.message)]; }

  const lock = loadLock(projectDir);
  items.push(lock.state === 'ok' ? item('lock', true, 'OK', '.keel/policy.lock.json matches the policy') : item('lock', true, 'BROKEN', lock.reason));

  const expected = compile(projectDir, { write: false }).files;
  const settings = readJson(path.join(projectDir, SETTINGS));
  const lockJson = readJson(path.join(projectDir, '.keel/policy.lock.json'));
  const wanted = lockJson?.managedDeny ?? [];
  const deny = settings?.permissions?.deny ?? [];
  const absent = wanted.filter((r) => !deny.includes(r));
  items.push(!settings ? item('deny-rules', true, 'MISSING', `${SETTINGS} not found`)
    : !wanted.length ? item('deny-rules', true, 'BROKEN', 'the lock records no Keel deny rules — run `keel compile`')
    : absent.length ? item('deny-rules', true, 'BROKEN', `${absent.length} Keel deny rule(s) missing from ${SETTINGS}`) : item('deny-rules', true, 'OK', `${wanted.length} deny rules present`));
  for (const [id, rel] of [['codeowners', CODEOWNERS], ['workflow', WORKFLOW], ['ci-script', CI_SCRIPT_DST]]) {
    const st = sameFile(projectDir, rel, expected[rel]);
    items.push(item(id, true, st, st === 'OK' ? `${rel} matches the policy` : st === 'MISSING' ? `${rel} is missing — run \`keel compile\`` : `${rel} differs from what the policy compiles to — run \`keel compile\``));
  }
  items.push(pluginInstalled(pluginList));
  items.push(hooksEnabled(projectDir));
  const bypassOff = [path.join(os.homedir(), '.claude', 'settings.json'), path.join(projectDir, SETTINGS)].some((f) => readJson(f)?.permissions?.disableBypassPermissionsMode === 'disable');
  items.push(bypassOff ? item('bypass-mode', false, 'OK', 'bypassPermissions mode is disabled')
    : item('bypass-mode', false, 'MISSING', 'consider permissions.disableBypassPermissionsMode: "disable" (gates held in bypass mode in our live test, but removing the mode removes the question)'));
  items.push(item('mods', false, 'UNPROVEN', 'Claude Code mods with a tool.check handler can override hook decisions unless hooks are in managed settings; review installed mods'));
  items.push(failClosed());
  if (lock.state === 'ok') items.push(...provenGates(projectDir, lock.policy, gateScript));
  else items.push(item('gates', true, 'UNPROVEN', 'fix the lock first; gates run in strict fallback mode until then'));
  items.push(...githubChecks(projectDir, policy, offline));
  items.push(testDbGuard(projectDir, policy));
  items.push(policy.backPressure.length
    ? item('back-pressure', false, 'OK', `CI runs: ${policy.backPressure.join(' → ')}`)
    : item('back-pressure', false, 'MISSING', 'no backPressure checks configured; keel-checks proves nothing yet'));
  items.push(item('live-only', false, 'UNPROVEN', 'not testable offline: whether hooks fire for Workflow-tool agents. (A hook block holding in bypassPermissions mode was observed live on Claude Code 2.1.296.)'));
  return items;
}

export function exitCode(items, { allowUnproven = false } = {}) {
  const bad = items.filter((i) => i.required && !['OK', 'ENFORCED'].includes(i.status) && !(allowUnproven && i.status === 'UNPROVEN'));
  return bad.length ? 1 : 0;
}

export function formatReport(items) {
  const w = Math.max(...items.map((i) => i.id.length));
  return items.map((i) => `${i.status.padEnd(9)} ${i.id.padEnd(w)}  ${i.required ? '' : '(advisory) '}${i.detail}`).join('\n');
}

