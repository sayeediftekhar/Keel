// Merge gate: no immediate merges, admin overrides or PR approvals by the agent.

import { base } from '../shell.mjs';
import { block } from './common.mjs';

const HTTP_CLIENTS = ['curl', 'wget', 'http', 'https'];

export function mergeBlock(how) {
  return block('merge', `${how} merges immediately and skips GitHub's required checks and reviews. `
    + 'Use auto-merge instead (`gh pr merge --auto`): GitHub merges once checks pass and, for HEAVY changes, '
    + 'the approver has reviewed.');
}

/** `gh pr merge`: only auto-merge passes; never --admin, never under a deny policy. */
function prMergeDecision(a, mode) {
  if (a.includes('--disable-auto') && !a.includes('--admin')) return null;
  if (mode === 'deny') {
    return block('merge', 'this project\'s policy does not let the agent merge PRs at all; the approver merges.');
  }
  if (a.includes('--admin')) {
    return block('merge', '`gh pr merge --admin` bypasses branch protection. Agents never use admin overrides.');
  }
  const auto = a.some((x) => x === '--auto' || x === '--auto=true');
  if (!auto) return mergeBlock('`gh pr merge` without --auto');
  return null;
}

/** True when the command approves a PR: `gh pr review --approve`, or the review API via `gh api` or HTTP. */
function isApproval(prog, a) {
  if (prog === 'gh' && a[0] === 'pr' && a[1] === 'review' && a.some((x) => x === '--approve' || x === '-a')) {
    return true;
  }
  const joined = a.join(' ');
  if (prog === 'gh' && a[0] === 'api'
    && /\/pulls\/\d+\/reviews\b|addPullRequestReview|submitPullRequestReview/.test(joined)
    && /\bAPPROVE\b/.test(joined)) return true;
  return HTTP_CLIENTS.includes(prog)
    && /api\.github\.com\S*(\/pulls\/\d+\/reviews\b|graphql)/.test(joined)
    && /\bAPPROVE\b/.test(joined);
}

/** Merges that dodge `gh pr merge`: a gh alias wrapping it, or a direct REST/GraphQL merge call. */
function indirectMerge(prog, a) {
  const joined = a.join(' ');
  if (prog === 'gh' && a[0] === 'alias' && a[1] === 'set'
    && /pr\s+merge|merge_pull|\bpush\b/.test(a.slice(2).join(' '))) {
    return block('merge', 'a gh alias that wraps `pr merge` or `push` would hide the action from the gate. '
      + 'Use the commands directly.');
  }
  if (prog === 'gh' && a[0] === 'api') {
    if (/\/pulls\/\d+\/merge\b|\/merges\b/.test(joined)) return mergeBlock('a direct merge API call');
    if (/mergePullRequest|mergeBranch/.test(joined)) return mergeBlock('a GraphQL merge mutation');
  }
  if (HTTP_CLIENTS.includes(prog)
    && /api\.github\.com\S*(\/pulls\/\d+\/merge\b|\/merges\b|graphql)/.test(joined)
    && /merge/i.test(joined)) return mergeBlock('a direct merge API call');
  return null;
}

export function mergeBash(cmd, ctx) {
  const mode = ctx.policy.gates.merge.agent;
  if (mode === 'allow') return null;
  const prog = base(cmd.argv[0]);
  const a = cmd.argv.slice(1);
  if (prog === 'gh' && a[0] === 'pr' && a[1] === 'merge') return prMergeDecision(a, mode);
  // Approving is the approver's act. While the agent's `gh` runs on a human's
  // token (before the GitHub App is wired, or in a cloud session) an approval
  // from here would satisfy keel-rigor and the code-owner review as that human.
  if (isApproval(prog, a)) {
    return block('merge', 'approving a pull request is the approver\'s act, done in their own session; '
      + 'an agent never approves (it would count as the human\'s review). Ask for the review and stop.');
  }
  return indirectMerge(prog, a);
}
