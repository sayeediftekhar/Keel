// Merge gate: no immediate merges, admin overrides or PR approvals by the agent.

import { base } from '../shell.mjs';
import { block } from './common.mjs';


export function mergeBlock(how) {
  return block('merge', `${how} merges immediately and skips GitHub's required checks and reviews. `
    + 'Use auto-merge instead (`gh pr merge --auto`): GitHub merges once checks pass and, for HEAVY changes, '
    + 'the approver has reviewed.');
}

export function mergeBash(cmd, ctx) {
  const mode = ctx.policy.gates.merge.agent;
  if (mode === 'allow') return null;
  const prog = base(cmd.argv[0]);
  const a = cmd.argv.slice(1);
  if (prog === 'gh' && a[0] === 'pr' && a[1] === 'merge') {
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
  // Approving is the approver's act. While the agent's `gh` runs on a human's
  // token (before the GitHub App is wired, or in a cloud session) an approval
  // from here would satisfy keel-rigor and the code-owner review as that human.
  const approveBlock = block('merge', 'approving a pull request is the approver\'s act, done in their own session; '
    + 'an agent never approves (it would count as the human\'s review). Ask for the review and stop.');
  if (prog === 'gh' && a[0] === 'pr' && a[1] === 'review' && a.some((x) => x === '--approve' || x === '-a')) {
    return approveBlock;
  }
  if (prog === 'gh' && a[0] === 'api'
    && /\/pulls\/\d+\/reviews\b|addPullRequestReview|submitPullRequestReview/.test(a.join(' '))
    && /\bAPPROVE\b/.test(a.join(' '))) return approveBlock;
  if (['curl', 'wget', 'http', 'https'].includes(prog)
    && /api\.github\.com\S*(\/pulls\/\d+\/reviews\b|graphql)/.test(a.join(' '))
    && /\bAPPROVE\b/.test(a.join(' '))) return approveBlock;
  if (prog === 'gh' && a[0] === 'alias' && a[1] === 'set'
    && /pr\s+merge|merge_pull|\bpush\b/.test(a.slice(2).join(' '))) {
    return block('merge', 'a gh alias that wraps `pr merge` or `push` would hide the action from the gate. '
      + 'Use the commands directly.');
  }
  if (prog === 'gh' && a[0] === 'api') {
    const joined = a.join(' ');
    if (/\/pulls\/\d+\/merge\b|\/merges\b/.test(joined)) return mergeBlock('a direct merge API call');
    if (/mergePullRequest|mergeBranch/.test(joined)) return mergeBlock('a GraphQL merge mutation');
  }
  if (['curl', 'wget', 'http', 'https'].includes(prog)
    && /api\.github\.com\S*(\/pulls\/\d+\/merge\b|\/merges\b|graphql)/.test(a.join(' '))
    && /merge/i.test(a.join(' '))) return mergeBlock('a direct merge API call');
  return null;
}
