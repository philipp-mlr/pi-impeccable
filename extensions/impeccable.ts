import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isBashToolResult, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { completions, loadCommands, skillPrompt, type CommandInfo } from "./commands.ts";
import { engineRunner, findSkillDir, parseJson } from "./engine.ts";
import { BLOCK_REASON, isBlockingPoll, isLiveBoot, isLiveStop } from "./guard.ts";
import { LiveSession } from "./live.ts";

const LIVE_NOTE =
	"Impeccable live mode is active. pi-impeccable polls the live server in the background and delivers " +
	"browser events as `impeccable-live` messages. Never run `live-poll` without `--reply`, and never pass " +
	"`--then-poll` or `--stream`; reply once per event, then end your turn.";

export default function (pi: ExtensionAPI) {
	let session: LiveSession | undefined;
	let commands: CommandInfo[] = [];

	const skillDir = (cwd: string) => findSkillDir(cwd);

	function startPolling(ctx: ExtensionContext, dir: string): void {
		if (session?.active) return;
		session = new LiveSession({
			run: engineRunner(dir),
			bin: join(dir, "scripts", "impeccable"),
			cwd: ctx.cwd,
			deliver: (text, mode) =>
				pi.sendMessage(
					{ customType: "impeccable-live", content: text, display: true },
					mode === "turn" ? { triggerTurn: true, deliverAs: "followUp" } : { deliverAs: "nextTurn" },
				),
			notify: (text, level) => ctx.hasUI && ctx.ui.notify(text, level),
			setStatus: (text) => ctx.hasUI && ctx.ui.setStatus("impeccable", text),
		});
		session.start();
	}

	async function live(args: string, ctx: ExtensionContext): Promise<void> {
		const dir = skillDir(ctx.cwd);
		if (!dir) return void ctx.ui.notify("impeccable skill not found (set IMPECCABLE_SKILL_DIR)", "error");
		if (session?.active) return void ctx.ui.notify("impeccable live is already running", "info");

		const target = args.trim();
		const result = await engineRunner(dir)(target ? ["live", "--target", target] : ["live"], { cwd: ctx.cwd });
		const boot = parseJson(result.stdout);
		if (!boot?.ok) {
			const detail = boot ? JSON.stringify(boot, null, 2) : (result.stderr || result.stdout).trim();
			pi.sendUserMessage(
				`${skillPrompt("live", target)}\n\n\`impeccable live\` could not start:\n\n\`\`\`\n${detail}\n\`\`\`\n\n` +
					"Resolve this (see reference/live.md and live-setup.md), then ask me to run `/impeccable live` again.",
			);
			return;
		}
		startPolling(ctx, dir);
		const { product: _p, design: _d, surfaceBrief: _s, ...summary } = boot;
		pi.sendMessage(
			{
				customType: "impeccable-live",
				content:
					"Impeccable live mode started; browser events will arrive as messages. " +
					`Open the app URL that serves ${JSON.stringify(boot.pageFiles)} (not the helper port).\n\n` +
					`\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\``,
				display: true,
			},
			{ deliverAs: "nextTurn" },
		);
		ctx.ui.notify("impeccable live started", "info");
	}

	async function stop(ctx: ExtensionContext): Promise<void> {
		await session?.stop();
		const dir = skillDir(ctx.cwd);
		if (!dir) return;
		const result = await engineRunner(dir)(["live-server", "stop"], { cwd: ctx.cwd });
		ctx.ui.notify((result.stdout || result.stderr).trim() || "impeccable live stopped", "info");
	}

	async function status(ctx: ExtensionContext): Promise<void> {
		const dir = skillDir(ctx.cwd);
		if (!dir) return void ctx.ui.notify("impeccable skill not found", "error");
		const result = await engineRunner(dir)(["live-status"], { cwd: ctx.cwd });
		const server = parseJson(result.stdout)?.liveServer;
		const poller = session?.active ? `polling, ${session.eventsDelivered} events delivered` : "not polling";
		ctx.ui.notify(
			server ? `server ${server.status} on :${server.port}, ${server.connectedClients} client(s); ${poller}` : poller,
			"info",
		);
	}

	pi.on("session_start", (_event, ctx) => {
		const dir = skillDir(ctx.cwd);
		commands = dir ? loadCommands(dir) : [];
	});

	pi.registerCommand("impeccable", {
		description: "Impeccable design skill: live mode and command shortcuts",
		getArgumentCompletions: (prefix) => completions(prefix, commands),
		handler: async (args, ctx) => {
			const [head = "", ...rest] = args.trim().split(/\s+/);
			const tail = rest.join(" ");
			if (head === "live") return live(tail, ctx);
			if (head === "stop") return stop(ctx);
			if (head === "status") return status(ctx);
			pi.sendUserMessage(skillPrompt(head, tail), { expandPromptTemplates: true });
		},
	});

	pi.on("tool_call", (event) => {
		if (!session?.active || !isToolCallEventType("bash", event)) return;
		if (isBlockingPoll(event.input.command)) return { block: true, reason: BLOCK_REASON };
	});

	pi.on("tool_result", async (event, ctx) => {
		if (!isBashToolResult(event) || event.isError) return;
		const command = String(event.input.command ?? "");
		if (isLiveStop(command)) return void (await session?.stop());
		if (!isLiveBoot(command) || session?.active) return;
		const dir = skillDir(ctx.cwd);
		const output = event.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		if (dir && parseJson(output)?.ok === true) startPolling(ctx, dir);
	});

	pi.on("before_agent_start", (event) => {
		if (session?.active) event.systemPromptOptions.promptGuidelines.push(LIVE_NOTE);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (!session?.active) return;
		await session.stop();
		const dir = skillDir(ctx.cwd);
		if (dir) await engineRunner(dir)(["live-server", "stop"], { cwd: ctx.cwd }).catch(() => undefined);
	});
}
