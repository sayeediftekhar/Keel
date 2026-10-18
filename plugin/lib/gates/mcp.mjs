// MCP gate: the same rules for MCP tools (GitHub, Supabase) as for Bash.

import { ALLOW, block } from './common.mjs';
import { mergeBlock } from './merge.mjs';
import { applyMigrationLive } from './migration.mjs';
import { isReadOnlySql } from './sql.mjs';

/** GitHub merge_pull_request: the merge gate's policy, as for `gh pr merge`. */
function mergePullRequest(tool, input, ctx, { g }) {
  if (g.merge.agent === 'allow') return ALLOW;
  return g.merge.agent === 'deny'
    ? block('merge', 'this project\'s policy does not let the agent merge PRs; the approver merges.')
    : mergeBlock('the GitHub merge_pull_request tool');
}

/** GitHub file writes: an explicit, unprotected branch only. */
function branchWrite(tool, input, ctx, { g }) {
  if (g.push.mode !== 'block') return ALLOW;
  const b = input.branch;
  if (!b) {
    return block('push', `${tool} without an explicit branch could write to the default branch. `
      + 'Name a feature branch.');
  }
  if (ctx.policy.protectedBranches.includes(String(b).replace(/^refs\/heads\//, ''))) {
    return block('push', `${tool} on ${b} writes straight to a protected branch. `
      + 'Write to a feature branch and open a PR.');
  }
  return ALLOW;
}

/** Supabase merge_branch applies migrations to production. */
function mergeBranch(tool, input, ctx, { g }) {
  if (g.migration.live === 'allow') return ALLOW;
  return block('migration', 'merge_branch applies a development branch\'s migrations to production. '
    + 'The approver merges branches; agents ship schema changes as approved migration batches.');
}

/** Supabase edge-function deploys outside a test project are production deploys. */
function deployEdgeFunction(tool, input, ctx, { g, pid, isTestProject }) {
  if (g.deploy.mode !== 'approver' || isTestProject) return ALLOW;
  return block('deploy', `deploying an edge function to ${pid ?? 'a live project'} is a production deploy. `
    + 'The approver deploys.');
}

/** GitHub workflow triggers whose name looks like a deploy. */
function actionsRunTrigger(tool, input, ctx, { g }) {
  if (g.deploy.mode !== 'approver') return ALLOW;
  const wf = String(input.workflow_id ?? input.workflow ?? '');
  if (/deploy|release|prod|publish/i.test(wf)) {
    return block('deploy', `triggering ${wf} looks like a production deploy. The approver runs deploy workflows.`);
  }
  return ALLOW;
}

/** Supabase execute_sql on a live project: allowed per liveSql (read-only SELECTs when 'read-only'). */
function executeSql(tool, input, ctx, { g, pid, isTestProject }) {
  if (isTestProject) return ALLOW;
  const mode = g.migration.liveSql;
  if (mode === 'allow') return ALLOW;
  if (mode === 'read-only' && isReadOnlySql(input.query ?? input.sql ?? '')) return ALLOW;
  return block('migration', `execute_sql on the live project ${pid ?? '(unknown)'} may change data. `
    + 'Live changes go through an approved migration batch; plain read-only SELECTs are allowed.');
}

/** Supabase apply_migration on a live project goes through the migration gate. */
function applyMigration(tool, input, ctx, { pid, isTestProject }) {
  if (isTestProject) return ALLOW;
  return applyMigrationLive(String(input.query ?? input.sql ?? ''), pid, ctx);
}

const MCP_TOOLS = new Map([
  ['merge_pull_request', mergePullRequest],
  ['push_files', branchWrite],
  ['create_or_update_file', branchWrite],
  ['delete_file', branchWrite],
  ['merge_branch', mergeBranch],
  ['deploy_edge_function', deployEdgeFunction],
  ['actions_run_trigger', actionsRunTrigger],
  ['apply_migration', applyMigration],
  ['execute_sql', executeSql],
]);

export function decideMcp(tool, input, ctx) {
  const g = ctx.policy.gates;
  const env = ctx.policy.environments;
  const pid = input.project_id ?? input.projectId ?? input.project_ref;
  const isTestProject = env.test.supabaseProjectIds.includes(pid);
  const decide = MCP_TOOLS.get(tool);
  return decide ? decide(tool, input, ctx, { g, pid, isTestProject }) : ALLOW;
}
