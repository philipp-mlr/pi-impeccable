import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { engineRunner, type RunResult, type Runner } from "../extensions/engine.ts";
import { DesignHook, hookPolicy, isHookDisabledByConfig } from "../extensions/hook.ts";

function fake(outputs: Array<RunResult | Error>, env: Record<string, string> = {}) {
	const calls: Array<{ args: string[]; event: Record<string, unknown> }> = [];
	const run: Runner = async (args, opts) => {
		calls.push({ args, event: JSON.parse(opts.input ?? "null") });
		const next = outputs.shift() ?? { code: 0, stdout: "", stderr: "" };
		if (next instanceof Error) throw next;
		return next;
	};
	return { hook: new DesignHook(run, env), calls };
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

function withHookConfig(files: Record<string, unknown>): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-impeccable-cfg-"));
	mkdirSync(join(dir, ".impeccable"), { recursive: true });
	for (const [name, value] of Object.entries(files))
		writeFileSync(join(dir, ".impeccable", name), JSON.stringify(value));
	return dir;
}

describe("hookPolicy", () => {
	it("forces the hook by default", () => {
		expect(hookPolicy({})).toBe("forced");
		expect(hookPolicy({ PI_IMPECCABLE_HOOK: "on" })).toBe("forced");
		expect(hookPolicy({ IMPECCABLE_HOOK_DISABLED: "0" })).toBe("forced");
	});

	it("only accepts the global kill switches", () => {
		expect(hookPolicy({ PI_IMPECCABLE_HOOK: "off" })).toBe("off");
		expect(hookPolicy({ PI_IMPECCABLE_HOOK: "OFF" })).toBe("off");
		expect(hookPolicy({ PI_IMPECCABLE_HOOK: "0" })).toBe("forced");
		expect(hookPolicy({ IMPECCABLE_HOOK_DISABLED: "1" })).toBe("off");
	});
});

describe("isHookDisabledByConfig", () => {
	it("is fail-open without config", () => {
		expect(isHookDisabledByConfig(mkdtempSync(join(tmpdir(), "pi-impeccable-empty-")))).toBe(false);
	});

	it("sees hook.enabled false and local overrides", () => {
		expect(isHookDisabledByConfig(withHookConfig({ "config.json": { hook: { enabled: false } } }))).toBe(true);
		expect(
			isHookDisabledByConfig(
				withHookConfig({ "config.json": { hook: { enabled: true } }, "config.local.json": { hook: { enabled: false } } }),
			),
		).toBe(true);
		expect(isHookDisabledByConfig(withHookConfig({ "config.json": { detector: { ignoreFiles: ["legacy/"] } } }))).toBe(false);
	});

	it("ignores malformed config", () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-impeccable-bad-"));
		mkdirSync(join(dir, ".impeccable"), { recursive: true });
		writeFileSync(join(dir, ".impeccable", "config.json"), "{not json");
		expect(isHookDisabledByConfig(dir)).toBe(false);
	});
});

describe("DesignHook mandatory mode", () => {
	it("stays silent when the global kill switch is set", async () => {
		const { hook, calls } = fake([], { PI_IMPECCABLE_HOOK: "off" });
		expect(await hook.afterEdit({ cwd: "/app", sessionId: "s", tool: "edit", path: "a.tsx" })).toBe("");
		expect(await hook.beforeSettle({ cwd: "/app", sessionId: "s" })).toBe("");
		expect(calls).toEqual([]);
	});

	it("falls back to detect when repo config disables the hook", async () => {
		const app = withHookConfig({ "config.json": { hook: { enabled: false } } });
		const { hook, calls } = fake([{ code: 2, stdout: "src/a.tsx: overused-font (bold-header)\n", stderr: "" }]);
		expect(await hook.afterEdit({ cwd: app, sessionId: "s", tool: "edit", path: "src/a.tsx" })).toContain("overused-font");
		expect(calls[0].args).toEqual(["detect", join(app, "src/a.tsx")]);
		expect(calls[0].event).toBeNull();
	});

	it("runs the mandatory settle pass over the edited files", async () => {
		const app = withHookConfig({ "config.json": { hook: { enabled: false } } });
		const { hook, calls } = fake([
			{ code: 2, stdout: "a\n", stderr: "" },
			{ code: 2, stdout: "b\n", stderr: "" },
			{ code: 2, stdout: "deep findings", stderr: "" },
		]);
		await hook.afterEdit({ cwd: app, sessionId: "s", tool: "write", path: "a.tsx" });
		await hook.afterEdit({ cwd: app, sessionId: "s", tool: "write", path: "b.tsx" });
		expect(await hook.beforeSettle({ cwd: app, sessionId: "s" })).toContain("deep findings");
		expect(calls[2].args).toEqual(["detect", join(app, "a.tsx"), join(app, "b.tsx")]);
		expect(await hook.beforeSettle({ cwd: app, sessionId: "s" })).toBe("");
	});
	it("caps the mandatory settle pass at 20 files like the engine", async () => {
		const app = withHookConfig({ "config.json": { hook: { enabled: false } } });
		const { hook, calls } = fake([
			...Array.from({ length: 21 }, () => ({ code: 2, stdout: "", stderr: "" }) as RunResult),
			{ code: 2, stdout: "deep findings", stderr: "" },
		]);
		for (let i = 0; i < 21; i++) await hook.afterEdit({ cwd: app, sessionId: "s", tool: "write", path: `f${i}.tsx` });
		expect(await hook.beforeSettle({ cwd: app, sessionId: "s" })).toContain("deep findings");
		expect(calls).toHaveLength(22);
		expect(calls[21].args).toHaveLength(21);
		expect(calls[21].args).toEqual(["detect", ...Array.from({ length: 20 }, (_, i) => join(app, `f${i}.tsx`))]);
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
