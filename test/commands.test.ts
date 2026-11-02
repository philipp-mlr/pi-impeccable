import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { completions, loadCommands, skillPrompt } from "../extensions/commands.ts";

function fakeSkill(metadata: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), "impeccable-"));
	mkdirSync(join(dir, "scripts"));
	writeFileSync(join(dir, "scripts", "command-metadata.json"), JSON.stringify(metadata));
	return dir;
}

describe("loadCommands", () => {
	it("reads command metadata and leaves live to the extension", () => {
		const dir = fakeSkill({ polish: { description: "Final pass. More text." }, live: { description: "x" } });
		expect(loadCommands(dir)).toEqual([{ name: "polish", description: "Final pass. More text." }]);
	});

	it("returns nothing for a missing or broken skill", () => {
		expect(loadCommands("/nonexistent")).toEqual([]);
	});
});

describe("completions", () => {
	const commands = [
		{ name: "polish", description: "Final pass. More text." },
		{ name: "critique", description: "Review" },
	];

	it("offers live subcommands and skill commands by prefix", () => {
		expect(completions("", commands)?.map((c) => c.value)).toEqual([
			"live",
			"stop",
			"status",
			"hooks",
			"doctor",
			"pin",
			"unpin",
			"polish",
			"critique",
		]);
		expect(completions("p", commands)?.map((c) => c.value)).toEqual(["pin", "polish"]);
		expect(completions("st", commands)?.map((c) => c.value)).toEqual(["stop", "status"]);
		expect(completions("po", commands)?.[0]).toEqual({ value: "polish", label: "polish", description: "Final pass." });
	});

	it("stops completing after the first word", () => {
		expect(completions("polish src", commands)).toBeNull();
		expect(completions("zzz", commands)).toBeNull();
	});
});

describe("skillPrompt", () => {
	it("routes through the skill command", () => {
		expect(skillPrompt("polish", "src/hero.tsx")).toBe("/skill:impeccable polish src/hero.tsx");
		expect(skillPrompt("", "")).toBe("/skill:impeccable");
	});
});
