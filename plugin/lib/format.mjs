// The format hook's decision (D20e, rule c): formatting is fixed on write by the
// project's own formatter, never failed in CI. Pure, so tests drive it;
// plugin/hooks/format.mjs runs the command it returns.

import path from 'node:path';

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

/** {file, args, cwd} to run after a file tool wrote `tool_input.file_path`, or null. The formatter is
 *  argv from the lock (validated: no shell), run on the one project-relative file just written. */
export function formatCommand(event, projectDir, formatter) {
  if (!formatter || !WRITE_TOOLS.has(event?.tool_name)) return null;
  const target = event.tool_input?.file_path;
  if (!target) return null;
  const rel = path.relative(projectDir, path.resolve(event.cwd || projectDir, target));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null; // outside the project
  if (/^(node_modules|\.keel|\.git)(\/|$)/.test(rel.split(path.sep).join('/'))) return null;
  const [bin, ...args] = formatter.trim().split(/\s+/);
  return { file: bin.includes('/') ? path.resolve(projectDir, bin) : bin, args: [...args, rel], cwd: projectDir };
}
