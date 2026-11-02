import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findSkillDir } from "../extensions/engine.ts";

const bundled = join(dirname(dirname(fileURLToPath(import.meta.url))), "skills", "impeccable");

function scratch(): string {
	return mkdtempSync(join(tmpdir(), "find-skill-dir-"));
}

function stubSkill(root: string, ...parts: string[]): string {
	const dir = join(root, ...parts, "scripts");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "impeccable"), "#!/bin/sh\n");
	return join(root, ...parts);
}

describe("findSkillDir", () => {
	it("prefers IMPECCABLE_SKILL_DIR over everything", () => {
		const cwd = scratch();
		const envDir = stubSkill(scratch(), "env");
		const projectDir = stubSkill(cwd, ".agents", "skills", "impeccable");
		expect(findSkillDir(cwd, { IMPECCABLE_SKILL_DIR: envDir })).toBe(envDir);
		expect(envDir).not.toBe(projectDir);
	});

	it("prefers the project copy over the bundled one", () => {
		const cwd = scratch();
		const projectDir = stubSkill(cwd, ".agents", "skills", "impeccable");
		expect(findSkillDir(cwd, {})).toBe(projectDir);
	});

	it("finds a project .pi/skills copy", () => {
		const cwd = scratch();
		const projectDir = stubSkill(cwd, ".pi", "skills", "impeccable");
		expect(findSkillDir(cwd, {})).toBe(projectDir);
	});

	it("falls back to the bundled skill of this package", () => {
		expect(findSkillDir(scratch(), {})).toBe(bundled);
	});
});
