// The gate hook's logic, importable so tests can inject a fake GitHub.
import fs from 'node:fs';
import { decide, NEED_REMOTE } from './gates.mjs';
import { loadLock, strictFallbackPolicy } from './policy.mjs';
import { makeEnv, fetchGithubRemote, gitToplevel, registry, register } from './runtime.mjs';

/** Which projects does this tool call touch? The session's project and the git toplevel of cwd. */
function candidates(event) {
  // One real path per project: CLAUDE_PROJECT_DIR may be spelled through a
  // symlink while git reports the resolved path, and both must evaluate (and
  // register) as the same project.
  const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
  const out = [];
  const pd = process.env.CLAUDE_PROJECT_DIR;
  if (pd) out.push(real(pd));
  const top = event.cwd && fs.existsSync(event.cwd) ? gitToplevel(event.cwd) : null;
  if (top && !out.includes(real(top))) out.push(real(top));
  if (!out.length) out.push(real(event.cwd || process.cwd()));
  return out;
}

function stateFor(projectDir) {
  if (!fs.existsSync(projectDir)) {
    return { state: 'broken', reason: `the project directory ${projectDir} no longer exists` };
  }
  const lock = loadLock(projectDir);
  if (lock.state === 'inactive' && registry().includes(projectDir)) {
    return {
      state: 'broken',
      reason: 'this project used Keel, but its policy and lock are gone — restore them or run `keel compile`',
    };
  }
  return lock;
}

/** Returns {allow:true} | {allow:false, gate, reason}. deps.fetchRemote is injectable for tests. */
export async function evaluate(event, deps = {}) {
  const fetchRemote = deps.fetchRemote ?? defaultFetch;
  for (const projectDir of candidates(event)) {
    const lock = stateFor(projectDir);
    if (lock.state === 'inactive') continue;
    let policy = lock.policy; let note = ''; let slug = lock.github ?? null;
    if (lock.state === 'broken') {
      policy = strictFallbackPolicy();
      note = ` (Keel policy problem: ${lock.reason})`;
      slug = null;
    } else { try { register(projectDir); } catch { /* registry is best effort */ } }

    const run = (remote) => decide(event, { policy, projectDir, env: makeEnv(projectDir, policy, remote) });
    let d;
    try { d = run(null); }
    catch (e) {
      if (e !== NEED_REMOTE) throw e;
      let remote;
      try {
        if (!slug) {
          throw new Error('no GitHub repository is recorded in the Keel lock ' +
            '(origin must be a GitHub remote when you run `keel compile`)');
        }
        remote = await fetchRemote(slug, policy.defaultBranch, policy, projectDir);
      } catch (err) {
        return {
          allow: false,
          gate: 'migration',
          reason: `a live migration needs its approval verified on GitHub, and that failed: ${err.message}. ` +
            `Blocking to stay safe.${note}`,
        };
      }
      d = run(remote);
    }
    if (!d.allow) return { ...d, reason: d.reason + note };
  }
  return { allow: true };
}

function defaultFetch(slug, branch, policy) {
  return fetchGithubRemote(slug, branch, policy);
}
