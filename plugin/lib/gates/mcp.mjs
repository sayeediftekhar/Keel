// MCP gate: the same rules for MCP tools (GitHub, Supabase) as for Bash.

import { ALLOW, block } from './common.mjs';
import { mergeBlock } from './merge.mjs';
import { applyMigrationLive } from './migration.mjs';
import { isReadOnlySql } from './sql.mjs';


export function decideMcp(tool, input, ctx) {
  const g = ctx.policy.gates;
  const env = ctx.policy.environments;
  const pid = input.project_id ?? input.projectId ?? input.project_ref;
  const isTestProject = env.test.supabaseProjectIds.includes(pid);
  if (tool === 'merge_pull_request') {
    if (g.merge.agent === 'allow') return ALLOW;
    return g.merge.agent === 'deny'
      ? block('merge', 'this project\'s policy does not let the agent merge PRs; the approver merges.')
      : mergeBlock('the GitHub merge_pull_request tool');
  }
  if (['push_files', 'create_or_update_file', 'delete_file'].includes(tool)) {
    if (g.push.mode !== 'block') return ALLOW;
    const b = input.branch;
    if (!b) return block('push', `${tool} without an explicit branch could write to the default branch. Name a feature branch.`);
    if (ctx.policy.protectedBranches.includes(String(b).replace(/^refs\/heads\//, ''))) {
      return block('push', `${tool} on ${b} writes straight to a protected branch. Write to a feature branch and open a PR.`);
    }
    return ALLOW;
  }
  if (tool === 'merge_branch') {
    if (g.migration.live === 'allow') return ALLOW;
    return block('migration', 'merge_branch applies a development branch\'s migrations to production. The approver merges branches; agents ship schema changes as approved migration batches.');
  }
  if (tool === 'deploy_edge_function') {
    if (g.deploy.mode !== 'approver' || isTestProject) return ALLOW;
    return block('deploy', `deploying an edge function to ${pid ?? 'a live project'} is a production deploy. The approver deploys.`);
  }
  if (tool === 'actions_run_trigger' && g.deploy.mode === 'approver') {
    const wf = String(input.workflow_id ?? input.workflow ?? '');
    if (/deploy|release|prod|publish/i.test(wf)) return block('deploy', `triggering ${wf} looks like a production deploy. The approver runs deploy workflows.`);
    return ALLOW;
  }
  if (tool === 'apply_migration' || tool === 'execute_sql') {
    if (isTestProject) return ALLOW;
    if (tool === 'execute_sql') {
      const mode = g.migration.liveSql;
      if (mode === 'allow') return ALLOW;
      if (mode === 'read-only' && isReadOnlySql(input.query ?? input.sql ?? '')) return ALLOW;
      return block('migration', `execute_sql on the live project ${pid ?? '(unknown)'} may change data. Live changes go through an approved migration batch; plain read-only SELECTs are allowed.`);
    }
    return applyMigrationLive(String(input.query ?? input.sql ?? ''), pid, ctx);
  }
  return ALLOW;
}
