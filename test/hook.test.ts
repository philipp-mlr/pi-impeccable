import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { engineRunner, type RunResult, type Runner } from "../extensions/engine.ts";
import { DesignHook } from "../extensions/hook.ts";

function fake(outputs: Array<RunResult | Error>) {
	const calls: Array<{ args: string[]; event: Record<string, unknown> }> = [];
	const run: Runner = async (args, opts) => {
		calls.push({ args, event: JSON.parse(opts.input ?? "null") });
		const next = outputs.shift() ?? { code: 0, stdout: "", stderr: "" };
		if (next instanceof Error) throw next;
		return next;
	};
	return { hook: new DesignHook(run), calls };
}

const context = (text: string, event = "PostToolUse"): RunResult => ({
	code: 0,
	stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }),
	stderr: "",
});

describe("DesignHook.afterEdit", () => {
	it("sends a Claude-shaped PostToolUse event with the absolute path", async () => {
		const { hook, calls } = fake([context("2 issues")]);
		expect(await hook.afterEdit({ cwd: "/app", sessionId: "s1", tool: "edit", path: "src/a.tsx" })).toBe("2 issues");
		expect(calls).toEqual([
			{
				args: ["hook"],
				event: {
					hook_event_name: "PostToolUse",
					cwd: "/app",
					session_id: "s1",
					tool_name: "Edit",
					tool_input: { file_path: "/app/src/a.tsx" },
				},
			},
		]);
	});

	it("maps write to Write", async () => {
		const { hook, calls } = fake([]);
		await hook.afterEdit({ cwd: "/app", sessionId: "s1", tool: "write", path: "/x/b.css" });
		expect(calls[0].event.tool_name).toBe("Write");
		expect(calls[0].event.tool_input).toEqual({ file_path: "/x/b.css" });
	});

	it("fails open on errors and garbage output", async () => {
		const { hook } = fake([new Error("boom"), { code: 1, stdout: "not json", stderr: "" }]);
		expect(await hook.afterEdit({ cwd: "/app", sessionId: "s", tool: "edit", path: "a.tsx" })).toBe("");
		expect(await hook.afterEdit({ cwd: "/app", sessionId: "s", tool: "edit", path: "a.tsx" })).toBe("");
	});
});

describe("DesignHook.beforeSettle", () => {
	it("stays silent when nothing was edited this run", async () => {
		const { hook, calls } = fake([]);
		expect(await hook.beforeSettle({ cwd: "/app", sessionId: "s1" })).toBe("");
		expect(calls).toEqual([]);
	});

	it("runs the Stop deep pass once after edits", async () => {
		const { hook, calls } = fake([context(""), context("deep findings", "Stop")]);
		await hook.afterEdit({ cwd: "/app", sessionId: "s1", tool: "edit", path: "a.tsx" });
		expect(await hook.beforeSettle({ cwd: "/app", sessionId: "s1" })).toBe("deep findings");
		expect(calls[1].event).toEqual({ hook_event_name: "Stop", cwd: "/app", session_id: "s1", stop_hook_active: false });
		expect(await hook.beforeSettle({ cwd: "/app", sessionId: "s1" })).toBe("");
		expect(calls).toHaveLength(2);
	});

	it("accepts the decision/reason Stop shape", async () => {
		const { hook } = fake([context(""), { code: 0, stdout: '{"decision":"block","reason":"fix it"}', stderr: "" }]);
		await hook.afterEdit({ cwd: "/app", sessionId: "s1", tool: "write", path: "a.html" });
		expect(await hook.beforeSettle({ cwd: "/app", sessionId: "s1" })).toBe("fix it");
	});
});

const skillDir = process.env.IMPECCABLE_SKILL_DIR;

describe.skipIf(!skillDir)("DesignHook against the real engine", () => {
	it("reports per-edit findings and a deep pass", async () => {
		const app = mkdtempSync(join(tmpdir(), "pi-impeccable-hook-"));
		execFileSync("git", ["init", "-q"], { cwd: app });
		mkdirSync(join(app, "src"));
		writeFileSync(
			join(app, "src", "index.html"),
			'<html><body><h1 style="background:linear-gradient(90deg,#f0f,#0ff);-webkit-background-clip:text;color:transparent">Hi</h1></body></html>\n',
		);
		const hook = new DesignHook(engineRunner(skillDir!));
		const text = await hook.afterEdit({ cwd: app, sessionId: "t1", tool: "write", path: "src/index.html" });
		expect(text).toContain("gradient-text");
		await expect(hook.beforeSettle({ cwd: app, sessionId: "t1" })).resolves.toBeTypeOf("string");
	});
});
