import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, eventMessage } from "../extensions/events.ts";

const baseline = JSON.parse(readFileSync(new URL("../scripts/baseline.json", import.meta.url), "utf8"));

describe("classify", () => {
	it("handles every baseline event type explicitly", () => {
		const expected: Record<string, string> = {
			generate: "turn",
			steer: "turn",
			manual_edit_apply: "turn",
			variant_mount_failed: "turn",
			prefetch: "context",
			accept: "turn",
			discard: "turn",
			timeout: "skip",
			exit: "exit",
		};
		expect(Object.keys(expected).sort()).toEqual(baseline.events);
		for (const type of baseline.events) expect(classify({ type }), type).toBe(expected[type]);
	});

	it("keeps clean accepts and discards out of the turn loop", () => {
		const ack = { _completionAck: { ok: true } };
		expect(classify({ type: "accept", ...ack, _acceptResult: { handled: true, carbonize: false } })).toBe("context");
		expect(classify({ type: "discard", ...ack, _acceptResult: { handled: true } })).toBe("context");
	});

	it("wakes the agent when an accept needs cleanup", () => {
		const ack = { _completionAck: { ok: true } };
		expect(classify({ type: "accept", ...ack, _acceptResult: { handled: true, carbonize: true } })).toBe("turn");
		expect(classify({ type: "accept", ...ack, _acceptResult: { handled: false, mode: "fallback" } })).toBe("turn");
		expect(classify({ type: "accept", _completionAck: { ok: false }, _acceptResult: { handled: true } })).toBe("turn");
		expect(classify({ type: "accept", _completionAck: { ok: true, requiresComplete: true }, _acceptResult: { handled: true } })).toBe("turn");
	});
});

describe("eventMessage", () => {
	it("drops the token and names the reply command", () => {
		const text = eventMessage({ type: "steer", id: "abc", message: "bigger", token: "secret" }, "/x/impeccable");
		expect(text).not.toContain("secret");
		expect(text).toContain('"id": "abc"');
		expect(text).toContain("/x/impeccable live-poll --reply");
	});

	it("marks prefetch as reply-free", () => {
		expect(eventMessage({ type: "prefetch", pageUrl: "/" }, "x")).toContain("no reply needed");
	});
});
