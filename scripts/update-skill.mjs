#!/usr/bin/env node
// Refreshes skills/impeccable from upstream (default: main) and rewrites VENDOR.md.
// Usage: update-skill.mjs [ref]   (exit 1 on drift findings, 2 on git/copy errors)
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const upstream = "https://github.com/pbakaus/impeccable";
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const ref = process.argv[2] || "main";

function git(args) {
	return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const vendorMd = `# Vendored skill

\`skills/impeccable/\` is a copy of [pbakaus/impeccable](https://github.com/pbakaus/impeccable)'s
pi skill (\`.pi/skills/impeccable/\` in the upstream repo), vendored so this
package ships the skill and the extension finds it without a separate install.
\`skills/impeccable/LICENSE\` is upstream's Apache-2.0 license.

- Source revision: \`{rev}\` (upstream \`{ref}\`)
- Engine version: {engine} (\`skills/impeccable/scripts/VERSION\`)
- Vendored: {date}

The extension is built against the protocol recorded in
\`scripts/baseline.json\`. Refresh the copy when upstream changes:

\`\`\`bash
node scripts/update-skill.mjs
\`\`\`

CI: every push/PR checks the vendored copy against the baseline (offline);
the weekly \`upstream-drift\` job compares it against upstream \`main\` and fails
when the copy is stale or the protocol drifted.
`;

const tmp = mkdtempSync(join(tmpdir(), "impeccable-upstream-"));
let rev, dest;
try {
	git(["clone", "--quiet", "--depth", "1", upstream, tmp]);
	if (ref !== "main") {
		git(["-C", tmp, "fetch", "--quiet", "--depth", "1", "origin", ref]);
		git(["-C", tmp, "checkout", "--quiet", "FETCH_HEAD"]);
	}
	rev = git(["-C", tmp, "rev-parse", "HEAD"]);
	dest = join(repoRoot, "skills", "impeccable");
	rmSync(dest, { recursive: true, force: true });
	cpSync(join(tmp, ".pi", "skills", "impeccable"), dest, { recursive: true });
	cpSync(join(tmp, "LICENSE"), join(dest, "LICENSE"));
	const engine = readFileSync(join(dest, "scripts", "VERSION"), "utf8").trim();
	writeFileSync(
		join(repoRoot, "VENDOR.md"),
		vendorMd.replaceAll("{rev}", rev).replaceAll("{ref}", ref).replaceAll("{engine}", engine).replaceAll("{date}", new Date().toISOString().slice(0, 10)),
	);
	console.log(`vendored ${rev.slice(0, 12)} (engine ${engine})`);
} catch (error) {
	console.error(`update-skill: ${error.message}`);
	process.exit(2);
} finally {
	rmSync(tmp, { recursive: true, force: true });
}

try {
	execFileSync(process.execPath, [join(repoRoot, "scripts", "drift-check.mjs"), dest, "--offline"], { stdio: "inherit" });
} catch {
	process.exitCode = 1;
}
console.log("\nIf drift was reported: review extensions/ against the change, then refresh scripts/baseline.json (--print).");
