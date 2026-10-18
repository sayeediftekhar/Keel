// Gate decisions. Pure: everything that touches git, the filesystem or the
// network comes in through ctx.env, so the decision tables in test/ can
// drive it.
//
//   decide(event, ctx) -> { allow: true } | { allow: false, gate, reason }
//
// event: a Claude Code PreToolUse payload ({ tool_name, tool_input, cwd }).
// ctx:   { policy, projectDir, env } — see lib/runtime.mjs makeEnv() for env.
//
// env.approvals() may throw NEED_REMOTE: approvals are verified against
// GitHub, which the hook fetches only when a live migration is on the table.
//
// One module per gate lives in ./gates/; this file only routes a tool call to
// the gates that apply to it.

import { ALLOW } from './gates/common.mjs';
import { decideBash } from './gates/bash.mjs';
import { governance } from './gates/governance.mjs';
import { ledgerEdit } from './gates/ledger.mjs';
import { secretsWrite, secretsRead } from './gates/secrets.mjs';
import { decideMcp } from './gates/mcp.mjs';

export { NEED_REMOTE } from './gates/common.mjs';
export { SECRET_LITERAL } from './gates/secrets.mjs';
export { classifyMigrationCommand } from './gates/migration.mjs';
export { isReadOnlySql } from './gates/sql.mjs';

export function decide(event, ctx) {
  const name = event?.tool_name ?? '';
  const input = event?.tool_input ?? {};
  const cwd = event?.cwd || ctx.projectDir;

  if (name === 'Bash') return decideBash(String(input.command ?? ''), cwd, ctx);

  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(name)) {
    const g = governance([input.file_path ?? input.notebook_path], cwd, ctx);
    if (!g.allow) return g;
    const s = secretsWrite(name, input, ctx);
    if (!s.allow) return s;
    return ledgerEdit(name, input, cwd, ctx);
  }
  if (name === 'Read' || name === 'Grep' || name === 'Glob') return secretsRead(name, input, ctx);

  const mcp = /^mcp__.+__([A-Za-z0-9_]+)$/.exec(name);
  if (mcp) return decideMcp(mcp[1], input, ctx);
  return ALLOW;
}
