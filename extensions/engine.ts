import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface RunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

export type Runner = (args: string[], opts: { cwd: string; signal?: AbortSignal }) => Promise<RunResult>;

export function findSkillDir(cwd: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
	const candidates = [
		env.IMPECCABLE_SKILL_DIR,
		join(cwd, ".agents", "skills", "impeccable"),
		join(cwd, ".pi", "skills", "impeccable"),
		join(homedir(), ".agents", "skills", "impeccable"),
	];
	return candidates.find((dir): dir is string => !!dir && existsSync(join(dir, "scripts", "impeccable")));
}

export function engineRunner(skillDir: string): Runner {
	const bin = join(skillDir, "scripts", "impeccable");
	return (args, { cwd, signal }) =>
		new Promise((resolve, reject) => {
			const child = spawn(bin, args, {
				cwd,
				signal,
				env: { ...process.env, IMPECCABLE_NO_TELEMETRY: process.env.IMPECCABLE_NO_TELEMETRY ?? "1" },
			});
			let stdout = "";
			let stderr = "";
			child.stdout.on("data", (chunk) => (stdout += chunk));
			child.stderr.on("data", (chunk) => (stderr += chunk));
			child.on("error", reject);
			child.on("close", (code) => resolve({ code, stdout, stderr }));
		});
}

export function parseJson(text: string): Record<string, any> | undefined {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end < start) return undefined;
	try {
		const value = JSON.parse(text.slice(start, end + 1));
		return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
	} catch {
		return undefined;
	}
}
