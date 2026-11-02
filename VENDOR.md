# Vendored skill

`skills/impeccable/` is a copy of [pbakaus/impeccable](https://github.com/pbakaus/impeccable)'s
pi skill (`.pi/skills/impeccable/` in the upstream repo), vendored so this
package ships the skill and the extension finds it without a separate install.
`skills/impeccable/LICENSE` is upstream's Apache-2.0 license.

- Source revision: `c3c94b960276a42a235d1ff68e9954a342e5407e` (upstream `main`)
- Engine version: 0.1.18 (`skills/impeccable/scripts/VERSION`)
- Vendored: 2026-11-02

The extension is built against the protocol recorded in
`scripts/baseline.json`. Refresh the copy when upstream changes:

```bash
node scripts/update-skill.mjs
```

CI: every push/PR checks the vendored copy against the baseline (offline);
the weekly `upstream-drift` job compares it against upstream `main` and fails
when the copy is stale or the protocol drifted.
