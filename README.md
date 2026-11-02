# pi-impeccable

[pi](https://github.com/earendil-works/pi) extension for
[Impeccable](https://impeccable.style/): ships the Impeccable skill itself,
plus non-blocking live mode, the design detector hook, and `/impeccable`
command shortcuts.

The skill (`skills/impeccable/`) is vendored from upstream — see
[VENDOR.md](VENDOR.md) for provenance and how to refresh it. Installing the
package is all you need; the extension finds the skill on its own.

Impeccable's live mode keeps the agent in a `live-poll` loop that waits up to
ten minutes per browser event, which blocks the session. This extension runs
that loop in the background and delivers browser events to the agent as
messages, so you can keep chatting while live mode is open.

## Install

```bash
pi install git:github.com/philipp-mlr/pi-impeccable
```

The extension looks for the skill in this order:

1. `$IMPECCABLE_SKILL_DIR`
2. `.agents/skills/impeccable` in the project
3. `.pi/skills/impeccable` in the project
4. `skills/impeccable` shipped with this package
5. `~/.agents/skills/impeccable`

Explicit locations (env, project) win over the bundled copy, so a project can
pin its own version; the bundled copy is the fallback that always works.

## Usage

```text
/impeccable live [target]   start live mode; events arrive as messages
/impeccable status          helper server and poller state
/impeccable stop            stop live mode and remove the injected script
/impeccable <command> ...   shortcut for /skill:impeccable <command> ...
```

`<command>` completes from the skill's `command-metadata.json` (`polish`,
`critique`, `audit`, ...) plus `hooks` and `doctor`. Upstream's `pin`/`unpin`
are not offered: `/impeccable <command>` already is the shortcut.

Commands typed while the agent is busy are queued as steering messages.

## Design hook

Upstream installs its design detector hook for Claude Code, Codex, Cursor,
Copilot, Grok, and Hermes, but not pi. This extension drives the same engine
from pi events:

- After each successful `edit`/`write`, it runs `impeccable hook` and appends
  the per-edit findings to the tool result.
- Before a completed run settles, it runs the Stop deep pass once over the
  files touched in that run. Findings arrive as an `impeccable-hook` message
  and the agent continues one more turn to triage them.

The engine decides what is a UI file and honors `hook.enabled`, `hook.quiet`,
and the ignore lists in `.impeccable/config.json`, so `/impeccable hooks off`
and the `ignore-*` actions work as documented upstream. `impeccable context`
still prints `MANUAL_DETECTOR_REQUIRED` because it only looks for upstream's
manifests; the extension tells the agent the hook is already covered.

While live mode runs:

- `generate`, `steer`, `manual_edit_apply`, `variant_mount_failed`, and
  accepts or discards that need cleanup start an agent turn.
- Clean accepts/discards and `prefetch` are added as context for the next turn.
- `timeout` is ignored; `exit` stops the helper server.
- The agent may only call `live-poll --reply ...`; foreground polls are blocked.
- If the agent starts live mode itself (`impeccable live` via bash), the
  extension takes over polling.
- Quitting pi stops the helper server and removes the injected script.

## Drift check

Impeccable changes its live protocol between releases. `scripts/baseline.json`
records the protocol this extension was built against: poll-loop event types
from `reference/live.md`, `live-poll` flags, and skill commands.

```bash
node scripts/drift-check.mjs skills/impeccable --offline  # vendored copy vs baseline
node scripts/drift-check.mjs <skill-dir>                  # exit 1 on drift
node scripts/drift-check.mjs <skill-dir> --print          # current snapshot
node scripts/drift-check.mjs <skill-dir> --offline        # skip the engine binary (sandboxed builds)
```

CI runs the vendored copy against the baseline on every push/PR, and weekly
against upstream `main` (job `upstream-drift`): a diff catches a stale vendored
copy, the drift check catches protocol changes. On drift, review `extensions/`
against the change, then refresh:

```bash
node scripts/update-skill.mjs        # re-vendor skills/impeccable from upstream main
node scripts/update-skill.mjs <ref>  # or a specific tag/commit
```

The script rewrites `VENDOR.md` and reports baseline deltas; bump
`scripts/baseline.json` via `--print` if the change is intended.

## Development

```bash
npm install
npm test                                        # unit tests
IMPECCABLE_SKILL_DIR=<skill-dir> npm test       # + real engine integration
npm run typecheck
```

## License

MIT
