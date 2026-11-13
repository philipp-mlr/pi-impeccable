import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseJson, type Runner } from "./engine.ts";

// Same budgets upstream gives its harness hooks (plugin/hooks/hooks.json).
const EDIT_TIMEOUT_MS = 5_000;
const STOP_TIMEOUT_MS = 30_000;
// Engine Stop deep pass scans at most 20 files; the mandatory fallback mirrors that.
const MAX_SETTLE_FILES = 20;

const TOOL_NAMES = { edit: "Edit", write: "Write" } as const;

export type HookPolicy = "forced" | "off";

/** The design hook is mandatory; only these global kill switches turn it off. */
export function hookPolicy(env: NodeJS.ProcessEnv): HookPolicy {
	if ((env.PI_IMPECCABLE_HOOK ?? "").toLowerCase() === "off") return "off";
	if (env.IMPECCABLE_HOOK_DISABLED && env.IMPECCABLE_HOOK_DISABLED !== "0" && env.IMPECCABLE_HOOK_DISABLED !== "false")
		return "off";
	return "forced";
}

function readHookRecord(cwd: string): Record<string, unknown> {
	const asRecord = (value: unknown): Record<string, unknown> =>
		value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
	const parse = (name: string): Record<string, unknown> => {
		const path = join(cwd, ".impeccable", name);
		if (!existsSync(path)) return {};
		try {
			return asRecord(JSON.parse(readFileSync(path, "utf8")));
		} catch {
			return {};
		}
	};
	const shared = parse("config.json");
	const local = parse("config.local.json");
	return { ...asRecord(shared.hook), ...asRecord(local.hook) };
}

/** True when the repo's `.impeccable/config*.json` opts out of the hook (fail-open). */
export function isHookDisabledByConfig(cwd: string): boolean {
	return readHookRecord(cwd).enabled === false;
}

export interface EditInfo {
	cwd: string;
	sessionId: string;
	tool: keyof typeof TOOL_NAMES;
	path: string;
}

/**
 * Upstream's design detector hook, driven from pi events. pi has no hook manifest, so this
 * feeds `impeccable hook` the Claude Code-shaped events it already understands (as upstream's
 * Hermes plugin does): PostToolUse after each edit/write, Stop once before the run settles.
 * The engine owns everything else: UI-file filtering, dedupe between passes. Fail-open: any
 * error or timeout yields no findings.
 *
 * The hook is mandatory: when the repo opts out via `hook.enabled: false`, this falls back to
 * `impeccable detect` over the touched files (detect ignores `hook.enabled`, but honors the
 * detector ignores). Only the global kill switches in `hookPolicy` disable it entirely.
 */
export class DesignHook {
	private edited = false;
	private paths: string[] = [];

	constructor(
		private readonly run: Runner,
		private readonly env: NodeJS.ProcessEnv = process.env,
	) {}

	async afterEdit({ cwd, sessionId, tool, path }: EditInfo): Promise<string> {
		if (hookPolicy(this.env) === "off") return "";
		const file = resolve(cwd, path);
		this.edited = true;
		this.paths.push(file);
		if (isHookDisabledByConfig(cwd))
			return this.callDetect(["detect", file], cwd, EDIT_TIMEOUT_MS);
		return this.call(
			{
				hook_event_name: "PostToolUse",
				cwd,
				session_id: sessionId,
				tool_name: TOOL_NAMES[tool],
				tool_input: { file_path: file },
			},
			cwd,
			EDIT_TIMEOUT_MS,
		);
	}

	/** The deep pass over files touched this run; empty when nothing was edited. */
	async beforeSettle({ cwd, sessionId }: { cwd: string; sessionId: string }): Promise<string> {
		if (!this.edited) return "";
		this.edited = false;
		const paths = this.paths.slice(0, MAX_SETTLE_FILES);
		this.paths = [];
		if (hookPolicy(this.env) === "off") return "";
		if (isHookDisabledByConfig(cwd)) return this.callDetect(["detect", ...paths], cwd, STOP_TIMEOUT_MS);
		return this.call(
			{ hook_event_name: "Stop", cwd, session_id: sessionId, stop_hook_active: false },
			cwd,
			STOP_TIMEOUT_MS,
		);
	}

	private async callDetect(args: string[], cwd: string, timeoutMs: number): Promise<string> {
		try {
			const result = await this.run(args, { cwd, signal: AbortSignal.timeout(timeoutMs) });
			return result.stdout.trim();
		} catch {
			return "";
		}
	}

	private async call(event: Record<string, unknown>, cwd: string, timeoutMs: number): Promise<string> {
		try {
			const result = await this.run(["hook"], {
				cwd,
				input: JSON.stringify(event),
				signal: AbortSignal.timeout(timeoutMs),
			});
			const output = parseJson(result.stdout);
			const text = output?.hookSpecificOutput?.additionalContext ?? output?.reason;
			return typeof text === "string" ? text.trim() : "";
		} catch {
			return "";
		}
	}
}
