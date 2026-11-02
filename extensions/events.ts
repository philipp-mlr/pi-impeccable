export type Delivery = "turn" | "context" | "skip" | "exit";

export function classify(event: Record<string, any>): Delivery {
	switch (event.type) {
		case "timeout":
			return "skip";
		case "exit":
			return "exit";
		case "prefetch":
			return "context";
		case "accept":
		case "discard":
			return needsFollowUp(event) ? "turn" : "context";
		default:
			return "turn";
	}
}

function needsFollowUp(event: Record<string, any>): boolean {
	if (event._completionAck?.ok !== true) return true;
	if (event._completionAck?.requiresComplete) return true;
	const result = event._acceptResult;
	return !result || result.handled !== true || result.carbonize === true;
}

export function eventMessage(event: Record<string, any>, bin: string): string {
	const { token: _token, ...rest } = event;
	const header =
		event.type === "prefetch"
			? "Impeccable live prefetch (no reply needed; read the page source if useful):"
			: `Impeccable live event \`${event.type}\`. Handle it per the impeccable skill's reference/live.md, ` +
				`then reply with \`${bin} live-poll --reply <id> ...\` where the event requires one. ` +
				"Do not start a poll yourself: pi-impeccable polls in the background.";
	return `${header}\n\n\`\`\`json\n${JSON.stringify(rest, null, 2)}\n\`\`\``;
}
