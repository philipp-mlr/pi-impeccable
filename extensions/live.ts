import { classify, eventMessage } from "./events.ts";
import { parseJson, type Runner } from "./engine.ts";

export interface LiveDeps {
	run: Runner;
	bin: string;
	cwd: string;
	deliver: (text: string, mode: "turn" | "context") => void;
	notify: (text: string, level: "info" | "warning" | "error") => void;
	setStatus: (text: string | undefined) => void;
	sleep?: (ms: number) => Promise<void>;
}

const MAX_FAILURES = 3;

export class LiveSession {
	private controller?: AbortController;
	private loop?: Promise<void>;
	private delivered = 0;

	constructor(private deps: LiveDeps) {}

	get active(): boolean {
		return !!this.controller;
	}

	get eventsDelivered(): number {
		return this.delivered;
	}

	start(): void {
		if (this.controller) return;
		const controller = new AbortController();
		this.controller = controller;
		this.deps.setStatus("✦ impeccable live");
		this.loop = this.pollLoop(controller.signal).finally(() => {
			if (this.controller === controller) this.reset();
		});
	}

	async stop(): Promise<void> {
		this.controller?.abort();
		await this.loop?.catch(() => {});
	}

	private reset(): void {
		this.controller = undefined;
		this.loop = undefined;
		this.deps.setStatus(undefined);
	}

	private async pollLoop(signal: AbortSignal): Promise<void> {
		const sleep = this.deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
		let failures = 0;
		while (!signal.aborted) {
			let result;
			try {
				result = await this.deps.run(["live-poll"], { cwd: this.deps.cwd, signal });
			} catch (error) {
				if (signal.aborted) return;
				result = { code: 1, stdout: "", stderr: String(error) };
			}
			if (signal.aborted) return;

			const event = result.code === 0 ? parseJson(result.stdout) : undefined;
			if (!event?.type) {
				const reason = (result.stderr || result.stdout).trim();
				if (/no running live server/i.test(reason) || ++failures >= MAX_FAILURES) {
					this.deps.notify(`impeccable live stopped: ${reason || "poll failed"}`, "warning");
					return;
				}
				await sleep(1000 * failures);
				continue;
			}
			failures = 0;

			const delivery = classify(event);
			if (delivery === "skip") continue;
			if (delivery === "exit") {
				await this.deps.run(["live-server", "stop"], { cwd: this.deps.cwd }).catch(() => undefined);
				this.deps.deliver("Impeccable live mode ended from the browser. The helper server was stopped; " +
					"remove any leftover `impeccable-variants-start` or `impeccable-carbonize-start` blocks.", "context");
				this.deps.notify("impeccable live ended", "info");
				return;
			}
			this.delivered++;
			this.deps.deliver(eventMessage(event, this.deps.bin), delivery);
		}
	}
}
