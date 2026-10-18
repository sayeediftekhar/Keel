// Shared by every gate: the decision shapes, the remote-fetch signal, and
// small helpers for paths and flags.

import os from 'node:os';

export const NEED_REMOTE = Symbol('need-remote');
export const ALLOW = Object.freeze({ allow: true });
export const block = (gate, reason) => ({ allow: false, gate, reason });

export const expandHome = (p) => String(p).replace(/^~(?=\/|$)/, os.homedir()).replace(/^\$\{?HOME\}?(?=\/|$)/, os.homedir());

export const flagValue = (argv, names) => {
  for (let i = 0; i < argv.length; i++) {
    for (const n of names) {
      if (argv[i] === n) return argv[i + 1];
      if (argv[i].startsWith(`${n}=`)) return argv[i].slice(n.length + 1);
      if (n.length === 2 && n.startsWith('-') && !n.startsWith('--') && argv[i].startsWith(n) && argv[i].length > 2) return argv[i].slice(2);
    }
  }
  return undefined;
};

export function safe(fn, fallback) {
  try { return fn(); } catch (e) { if (e === NEED_REMOTE) throw e; return fallback; }
}
