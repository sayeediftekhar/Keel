#!/usr/bin/env node
// Keel PreToolUse gate. Reads the hook event on stdin and either exits 0
// (allow: the normal permission flow continues) or exits 2 with the reason on
// stderr (block: Claude Code refuses the call and shows the agent why).
//
// Fail closed: any internal error exits 2. hooks.json also sets
// onFailure: "block", so a crash or timeout blocks instead of letting the
// call through (Claude Code's default for a failing hook is to allow).

import { evaluate } from '../lib/hookmain.mjs';
import { readStdin } from '../lib/runtime.mjs';

function deny(msg) {
  process.stderr.write(`Keel gate: ${msg}\n`);
  process.exit(2);
}

try {
  const event = JSON.parse(readStdin() || '{}');
  const d = await evaluate(event);
  if (!d.allow) deny(`[${d.gate}] ${d.reason}`);
  process.exit(0);
} catch (e) {
  deny(`internal error, blocking to stay safe: ${e?.message ?? e}`);
}
