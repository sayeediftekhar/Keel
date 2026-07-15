## What & why

<!-- One or two sentences: what this changes and the reason. -->

## Change type

- [ ] Skill / router instructions (`SKILL.md`, `CLAUDE.md`)
- [ ] Installer (`install.sh`) or `manifest.json`
- [ ] Docs only
- [ ] CI / repo meta

## Security checklist (Keel runs inside other people's agents)

- [ ] No hidden or out-of-band instructions added to any `SKILL.md` / `CLAUDE.md`
      (no "ignore the human gate", "exfiltrate", "run this silently", encoded text).
- [ ] `install.sh` changes run no new arbitrary commands and clone no new
      unreviewed sources; new upstreams are pinned where possible.
- [ ] No secrets, tokens, or real `.mcp.json` committed (template only).
- [ ] Human gates preserved — no change lets the agent commit/deploy/send on its own.

## Testing

<!-- e.g. `evals/install-regression.sh` passes; `bash -n install.sh` clean. CI must be green. -->
