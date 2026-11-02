import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without types
import { diff, pollFlags, pollLoopEvents } from "../scripts/drift-check.mjs";

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
