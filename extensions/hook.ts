import { resolve } from "node:path";
import { parseJson, type Runner } from "./engine.ts";

// Same budgets upstream gives its harness hooks (plugin/hooks/hooks.json).
const EDIT_TIMEOUT_MS = 5_000;
const STOP_TIMEOUT_MS = 30_000;

const TOOL_NAMES = { edit: "Edit", write: "Write" } as const;

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
 * The engine owns everything else: UI-file filtering, `hook.enabled`, dedupe between passes.
 * Fail-open: any error or timeout yields no findings.
 */
export class DesignHook {
	private edited = false;

	constructor(private readonly run: Runner) {}

	async afterEdit({ cwd, sessionId, tool, path }: EditInfo): Promise<string> {
		this.edited = true;
		return this.call(
			{
				hook_event_name: "PostToolUse",
				cwd,
				session_id: sessionId,
				tool_name: TOOL_NAMES[tool],
				tool_input: { file_path: resolve(cwd, path) },
			},
			cwd,
			EDIT_TIMEOUT_MS,
		);
	}

	/** The deep pass over files touched this run; empty when nothing was edited. */
	async beforeSettle({ cwd, sessionId }: { cwd: string; sessionId: string }): Promise<string> {
		if (!this.edited) return "";
		this.edited = false;
		return this.call(
			{ hook_event_name: "Stop", cwd, session_id: sessionId, stop_hook_active: false },
			cwd,
			STOP_TIMEOUT_MS,
		);
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
