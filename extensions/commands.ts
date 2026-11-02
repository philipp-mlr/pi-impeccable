import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface CommandInfo {
	name: string;
	description: string;
}

export const LIVE_COMMANDS: CommandInfo[] = [
	{ name: "live", description: "Start live mode; browser events are delivered in the background" },
	{ name: "stop", description: "Stop live mode and the helper server" },
	{ name: "status", description: "Show live server and poller state" },
];

export function loadCommands(skillDir: string): CommandInfo[] {
	try {
		const metadata = JSON.parse(readFileSync(join(skillDir, "scripts", "command-metadata.json"), "utf8"));
		return Object.entries(metadata as Record<string, { description?: string }>)
			.filter(([name]) => !LIVE_COMMANDS.some((c) => c.name === name))
			.map(([name, info]) => ({ name, description: info?.description ?? "" }));
	} catch {
		return [];
	}
}

export function completions(prefix: string, commands: CommandInfo[]) {
	if (/\s/.test(prefix)) return null;
	const items = [...LIVE_COMMANDS, ...commands]
		.filter((c) => c.name.startsWith(prefix))
		.map((c) => ({ value: c.name, label: c.name, description: firstSentence(c.description) }));
	return items.length ? items : null;
}

export function skillPrompt(command: string, args: string): string {
	return ["/skill:impeccable", command, args].filter(Boolean).join(" ");
}

function firstSentence(text: string): string {
	const match = text.match(/^.*?[.!?](\s|$)/);
	return (match ? match[0] : text).trim();
}
