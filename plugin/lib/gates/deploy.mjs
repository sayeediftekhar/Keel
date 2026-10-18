// Deploy gate: production deploy commands are the approver's.

import { base } from '../shell.mjs';
import { block } from './common.mjs';


export function deployBash(cmd, ctx) {
  if (ctx.policy.gates.deploy.mode !== 'approver') return null;
  const prog = base(cmd.argv[0]);
  for (const pattern of ctx.policy.gates.deploy.commands) {
    const [p0, ...rest] = pattern.split(/\s+/);
    if (prog === p0 && rest.every((t) => cmd.argv.includes(t))) {
      return block('deploy', `\`${pattern}\` deploys to production. `
        + 'Deploys are run by the approver; leave the change ready on a merged PR.');
    }
  }
  return null;
}
