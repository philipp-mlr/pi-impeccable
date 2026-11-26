import { describe, expect, it } from "vitest";
import extension, { liveNotConnected } from "../extensions/impeccable.ts";

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

describe("liveNotConnected", () => {
	it("names the missing dev server and where the tag went", () => {
		const text = liveNotConnected({ devUrl: null, pageFiles: ["internal/web/layout.templ"] });
		expect(text).toMatch(/no dev server answered/);
		expect(text).toContain('["internal/web/layout.templ"]');
	});

	it("points at the dev URL and a rebuild when a server answered", () => {
		const text = liveNotConnected({ devUrl: "http://localhost:8081", pageFiles: ["index.html"] });
		expect(text).toContain("http://localhost:8081");
		expect(text).toMatch(/rebuild or restart/);
	});
});
