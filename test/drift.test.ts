import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { check, diff, pollFlags, pollLoopEvents } from "../scripts/drift-check.mjs";

const liveMd = `
## Poll loop

\`\`\`
LOOP:
  impeccable live-poll
  "generate"  → Handle Generate; LOOP
  "steer"     → Handle Steer; LOOP
  "exit"      → break → Cleanup
\`\`\`
`;

describe("drift parsing", () => {
	it("extracts poll loop event types", () => {
		expect(pollLoopEvents(liveMd)).toEqual(["exit", "generate", "steer"]);
	});

	it("fails loudly when the poll loop section moves", () => {
		expect(() => pollLoopEvents("# nothing here")).toThrow(/Poll loop/);
	});

	it("extracts flags from help text", () => {
		expect(pollFlags("  --reply <id>   x\n  --timeout=MS  y\n  --then-poll  z\n  re-run --reply")).toEqual([
			"--reply",
			"--then-poll",
			"--timeout",
		]);
	});

	it("reports additions and removals", () => {
		expect(diff("x", ["a", "b"], ["b", "c"])).toEqual([{ name: "x", added: ["c"], removed: ["a"] }]);
		expect(diff("x", ["a"], ["a"])).toEqual([]);
	});
});

describe("offline check", () => {
	function skill(commands: Record<string, object>): string {
		const dir = mkdtempSync(join(tmpdir(), "drift-"));
		mkdirSync(join(dir, "reference"));
		mkdirSync(join(dir, "scripts"));
		writeFileSync(join(dir, "reference", "live.md"), liveMd);
		writeFileSync(join(dir, "scripts", "command-metadata.json"), JSON.stringify(commands));
		writeFileSync(join(dir, "scripts", "VERSION"), "9.9.9\n");
		return dir;
	}

	it("compares events and commands without running the engine", () => {
		const baseline = { events: ["exit", "generate", "steer"], pollFlags: ["--reply"], commands: ["polish"] };
		expect(check(skill({ polish: {} }), { baseline, offline: true }).findings).toEqual([]);
		expect(check(skill({ polish: {}, shine: {} }), { baseline, offline: true }).findings).toEqual([
			{ name: "skill commands", added: ["shine"], removed: [] },
		]);
	});
});
