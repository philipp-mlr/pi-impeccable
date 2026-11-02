const ENGINE = String.raw`\bimpeccable\S*\s+`;
const POLL = new RegExp(`${ENGINE}(?:live-)?poll\\b`);
const BOOT = new RegExp(`${ENGINE}live(?:\\s|$|;|&|\\|)`);
const STOP = new RegExp(`${ENGINE}live-server\\s+stop\\b`);

export const BLOCK_REASON =
	"pi-impeccable runs the live poll loop in the background and delivers browser events as messages. " +
	"Only run `live-poll --reply <id> ...` (without --then-poll or --stream).";

export function isBlockingPoll(command: string): boolean {
	if (!POLL.test(command)) return false;
	return !/--reply\b/.test(command) || /--then-poll\b|--stream\b/.test(command);
}

export function isLiveBoot(command: string): boolean {
	return BOOT.test(command);
}

export function isLiveStop(command: string): boolean {
	return STOP.test(command);
}
