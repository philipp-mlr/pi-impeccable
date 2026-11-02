# pi-impeccable

[pi](https://github.com/earendil-works/pi) extension for
[Impeccable](https://impeccable.style/): non-blocking live mode and
`/impeccable` command shortcuts.

Impeccable's live mode keeps the agent in a `live-poll` loop that waits up to
ten minutes per browser event, which blocks the session. This extension runs
that loop in the background and delivers browser events to the agent as
messages, so you can keep chatting while live mode is open.

It does not install, vendor, or update the Impeccable skill. Install the skill
yourself (any harness location works) and the extension finds it.

## Install

```bash
pi install git:github.com/philipp-mlr/pi-impeccable
```

The extension looks for the skill in this order:

1. `$IMPECCABLE_SKILL_DIR`
2. `.agents/skills/impeccable` in the project
3. `.pi/skills/impeccable` in the project
4. `~/.agents/skills/impeccable`

## Usage

```text
/impeccable live [target]   start live mode; events arrive as messages
/impeccable status          helper server and poller state
/impeccable stop            stop live mode and remove the injected script
/impeccable <command> ...   shortcut for /skill:impeccable <command> ...
```

`<command>` completes from the skill's `command-metadata.json` (`polish`,
`critique`, `audit`, ...).

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
node scripts/drift-check.mjs <skill-dir>          # exit 1 on drift
node scripts/drift-check.mjs <skill-dir> --print  # current snapshot
```

CI runs it weekly against the latest upstream skill. On drift, review
`extensions/` against the change, then refresh the baseline with `--print`.

## Development

```bash
npm install
npm test                                        # unit tests
IMPECCABLE_SKILL_DIR=<skill-dir> npm test       # + real engine integration
npm run typecheck
```

## License

MIT
