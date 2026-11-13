const ENGINE = String.raw`\bimpeccable\S*\s+`;
const POLL = new RegExp(`${ENGINE}(?:live-)?poll\\b`);
const BOOT = new RegExp(`${ENGINE}live(?:\\s|$|;|&|\\|)`);
const STOP = new RegExp(`${ENGINE}live-server\\s+stop\\b`);
const HOOKS_OFF = new RegExp(`${ENGINE}hooks\\s+off\\b`);
const HOOK_ADMIN_OFF = /\bhook-admin\S*\s+off\b/;

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

export const HOOK_BLOCK_REASON =
	"pi-impeccable enforces the design hook: `hooks off` has no effect here, the detector still runs. " +
	"To disable it globally, start pi with PI_IMPECCABLE_HOOK=off (or IMPECCABLE_HOOK_DISABLED=1).";

export function isHookDisable(command: string): boolean {
	return HOOKS_OFF.test(command) || HOOK_ADMIN_OFF.test(command);
}
