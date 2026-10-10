#!/usr/bin/env node
// Keel PreToolUse gate. Reads the hook event on stdin and either exits 0
// (allow: the normal permission flow continues) or exits 2 with the reason on
// stderr (block: Claude Code refuses the call and shows the agent why).
//
// Fail closed: any internal error exits 2. hooks.json also sets
// onFailure: "block" so a crash or timeout blocks instead of letting the
// call through (Claude Code's default for a failing hook is to allow).

import { decide } from '../lib/gates.mjs';
import { loadLock, strictFallbackPolicy } from '../lib/policy.mjs';
import { makeEnv, projectRoot, readStdin } from '../lib/runtime.mjs';

function deny(msg) {
  process.stderr.write(`Keel gate: ${msg}\n`);
  process.exit(2);
}

try {
  const event = JSON.parse(readStdin() || '{}');
  const projectDir = projectRoot(event.cwd);
  const lock = loadLock(projectDir);
  if (lock.state === 'inactive') process.exit(0); // project doesn't use Keel

  let policy = lock.policy;
  let note = '';
  if (lock.state === 'broken') {
    policy = strictFallbackPolicy(); // still gate risky actions with the strictest rules
    note = ` (Keel policy problem: ${lock.reason})`;
  }
  const d = decide(event, { policy, projectDir, env: makeEnv(projectDir, policy) });
  if (!d.allow) deny(`[${d.gate}] ${d.reason}${note}`);
  process.exit(0);
} catch (e) {
  deny(`internal error, blocking to stay safe: ${e?.message ?? e}`);
}
