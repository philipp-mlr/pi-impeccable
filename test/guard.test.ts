import { describe, expect, it } from "vitest";
import { isBlockingPoll, isLiveBoot, isLiveStop } from "../extensions/guard.ts";

const bin = "/nix/store/abc-source/.pi/skills/impeccable/scripts/impeccable";

describe("isBlockingPoll", () => {
	it("blocks foreground polls", () => {
		expect(isBlockingPoll(`${bin} live-poll`)).toBe(true);
		expect(isBlockingPoll(`${bin} live-poll --timeout=600000`)).toBe(true);
		expect(isBlockingPoll("npx impeccable poll")).toBe(true);
		expect(isBlockingPoll(`cd app && ${bin} live-poll --stream`)).toBe(true);
	});

	it("blocks replies that chain into a poll", () => {
		expect(isBlockingPoll(`${bin} live-poll --reply ab12 done --then-poll`)).toBe(true);
	});

	it("allows plain replies and unrelated commands", () => {
		expect(isBlockingPoll(`${bin} live-poll --reply ab12 done --file src/a.html`)).toBe(false);
		expect(isBlockingPoll(`${bin} live-poll --reply ab12 steer_done "ok"`)).toBe(false);
		expect(isBlockingPoll(`${bin} live-status`)).toBe(false);
		expect(isBlockingPoll("grep -r poll src/")).toBe(false);
	});
});

describe("live boot/stop detection", () => {
	it("detects boot without matching other live-* verbs", () => {
		expect(isLiveBoot(`${bin} live`)).toBe(true);
		expect(isLiveBoot(`${bin} live --target src/app`)).toBe(true);
		expect(isLiveBoot(`${bin} live && echo ok`)).toBe(true);
		expect(isLiveBoot(`${bin} live-status`)).toBe(false);
		expect(isLiveBoot(`${bin} live-poll`)).toBe(false);
		expect(isLiveBoot(`${bin} live-server stop`)).toBe(false);
	});

	it("detects stop", () => {
		expect(isLiveStop(`${bin} live-server stop`)).toBe(true);
		expect(isLiveStop(`${bin} live-server stop --keep-inject`)).toBe(true);
		expect(isLiveStop(`${bin} live-status`)).toBe(false);
	});
});
