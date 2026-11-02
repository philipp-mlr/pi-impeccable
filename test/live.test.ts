import { describe, expect, it } from "vitest";
import type { RunResult, Runner } from "../extensions/engine.ts";
import { LiveSession } from "../extensions/live.ts";

function harness(polls: Array<RunResult | Error>) {
	const calls: string[][] = [];
	const delivered: Array<{ text: string; mode: string }> = [];
	const notices: string[] = [];
	const statuses: Array<string | undefined> = [];
	let done!: () => void;
	const finished = new Promise<void>((r) => (done = r));
	const run: Runner = async (args, { signal }) => {
		calls.push(args);
		if (args[0] !== "live-poll") return { code: 0, stdout: "", stderr: "" };
		const next = polls.shift();
		if (!next) {
			done();
			return new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
		}
		if (next instanceof Error) throw next;
		return next;
	};
	const session = new LiveSession({
		run,
		bin: "/bin/impeccable",
		cwd: "/app",
		deliver: (text, mode) => delivered.push({ text, mode }),
		notify: (text) => notices.push(text),
		setStatus: (text) => statuses.push(text),
		sleep: async () => {},
	});
	return { session, calls, delivered, notices, statuses, finished };
}

const ok = (event: object): RunResult => ({ code: 0, stdout: JSON.stringify(event), stderr: "" });

describe("LiveSession", () => {
	it("delivers events and keeps polling", async () => {
		const h = harness([ok({ type: "timeout" }), ok({ type: "steer", id: "a1", message: "x" }), ok({ type: "prefetch", pageUrl: "/" })]);
		h.session.start();
		await h.finished;
		expect(h.delivered.map((d) => d.mode)).toEqual(["turn", "context"]);
		expect(h.delivered[0].text).toContain('"id": "a1"');
		expect(h.session.eventsDelivered).toBe(2);
		expect(h.session.active).toBe(true);
		await h.session.stop();
		expect(h.session.active).toBe(false);
		expect(h.statuses).toEqual(["✦ impeccable live", undefined]);
	});

	it("stops the server and ends on exit", async () => {
		const h = harness([ok({ type: "exit" })]);
		h.session.start();
		await new Promise((r) => setTimeout(r, 10));
		expect(h.session.active).toBe(false);
		expect(h.calls).toContainEqual(["live-server", "stop"]);
		expect(h.delivered[0].mode).toBe("context");
	});

	it("gives up immediately when the server is gone", async () => {
		const h = harness([{ code: 1, stdout: "", stderr: "No running live server found." }]);
		h.session.start();
		await new Promise((r) => setTimeout(r, 10));
		expect(h.session.active).toBe(false);
		expect(h.notices[0]).toMatch(/No running live server/);
	});

	it("retries transient failures, then gives up", async () => {
		const bad: RunResult = { code: 1, stdout: "garbage", stderr: "" };
		const h = harness([bad, new Error("spawn failed"), ok({ type: "steer", id: "b2" }), bad, bad, bad]);
		h.session.start();
		await new Promise((r) => setTimeout(r, 10));
		expect(h.delivered).toHaveLength(1);
		expect(h.session.active).toBe(false);
		expect(h.notices).toHaveLength(1);
	});

	it("ignores a second start", async () => {
		const h = harness([]);
		h.session.start();
		h.session.start();
		await h.finished;
		expect(h.calls.filter((c) => c[0] === "live-poll")).toHaveLength(1);
		await h.session.stop();
	});
});
