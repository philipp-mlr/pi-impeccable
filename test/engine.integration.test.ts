import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { engineRunner, parseJson } from "../extensions/engine.ts";
// @ts-expect-error plain ESM script without types
import { check } from "../scripts/drift-check.mjs";

const skillDir = process.env.IMPECCABLE_SKILL_DIR;

describe.skipIf(!skillDir)("real engine (IMPECCABLE_SKILL_DIR)", () => {
	it("matches the baseline protocol", () => {
		expect(check(skillDir).findings).toEqual([]);
	});

	it("boots live mode, times out a poll, and cleans up", async () => {
		const app = mkdtempSync(join(tmpdir(), "pi-impeccable-app-"));
		execFileSync("git", ["init", "-q"], { cwd: app });
		const page = "<!doctype html><html><body><h1>Hi</h1></body></html>\n";
		writeFileSync(join(app, "index.html"), page);
		writeFileSync(join(app, "PRODUCT.md"), "# Product\nTest.\n");
		writeFileSync(join(app, "DESIGN.md"), "# Design\nTest.\n");
		mkdirSync(join(app, ".impeccable", "live"), { recursive: true });
		writeFileSync(
			join(app, ".impeccable", "live", "config.json"),
			JSON.stringify({ files: ["index.html"], insertBefore: "</body>", commentSyntax: "html", cspChecked: true }),
		);
		const run = engineRunner(skillDir!);
		try {
			const boot = parseJson((await run(["live"], { cwd: app })).stdout);
			expect(boot?.ok).toBe(true);
			expect(readFileSync(join(app, "index.html"), "utf8")).toContain("live.js");

			const poll = await run(["live-poll", "--timeout=500"], { cwd: app });
			expect(parseJson(poll.stdout)?.type).toBe("timeout");
		} finally {
			await run(["live-server", "stop"], { cwd: app });
		}
		expect(readFileSync(join(app, "index.html"), "utf8")).toBe(page);
	}, 30_000);
});
