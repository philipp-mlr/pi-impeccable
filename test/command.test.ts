import { describe, expect, it } from "vitest";
import extension from "../extensions/impeccable.ts";

function load() {
	const sent: { content: unknown; options: unknown }[] = [];
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	const pi = {
		on: () => {},
		registerCommand: (_name: string, cmd: { handler: typeof handler }) => (handler = cmd.handler),
		sendUserMessage: (content: unknown, options: unknown) => sent.push({ content, options }),
		sendMessage: () => {},
	};
	extension(pi as never);
	return { sent, run: (args: string) => handler!(args, { cwd: "/", hasUI: false, isIdle: () => false }) };
}

describe("/impeccable command", () => {
	it("steers skill shortcuts into a busy agent instead of throwing", async () => {
		const { sent, run } = load();
		await run("polish header");
		expect(sent).toEqual([
			{ content: "/skill:impeccable polish header", options: { expandPromptTemplates: true, deliverAs: "steer" } },
		]);
	});
});
