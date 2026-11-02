#!/usr/bin/env node
// Compares an Impeccable skill dir against the protocol pi-impeccable was built for.
// Usage: drift-check.mjs <skill-dir>   (exit 1 on drift, 2 on usage/read errors)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const BASELINE = JSON.parse(readFileSync(new URL("./baseline.json", import.meta.url), "utf8"));

export function pollLoopEvents(liveMd) {
	const block = liveMd.split(/^## Poll loop$/m)[1]?.split(/^```$/m)[1];
	if (!block) throw new Error("reference/live.md: no '## Poll loop' code block");
	return [...block.matchAll(/^\s*"([a-z_]+)"\s*→/gm)].map((m) => m[1]).sort();
}

export function pollFlags(helpText) {
	return [...new Set([...helpText.matchAll(/(?<![\w-])(--[a-z][a-z-]*)/g)].map((m) => m[1]))].sort();
}

export function diff(name, expected, actual) {
	const added = actual.filter((x) => !expected.includes(x));
	const removed = expected.filter((x) => !actual.includes(x));
	return added.length || removed.length ? [{ name, added, removed }] : [];
}

export function snapshot(skillDir) {
	const engine = join(skillDir, "scripts", "impeccable");
	const env = { ...process.env, IMPECCABLE_NO_TELEMETRY: "1" };
	return {
		events: pollLoopEvents(readFileSync(join(skillDir, "reference", "live.md"), "utf8")),
		pollFlags: pollFlags(execFileSync(engine, ["live-poll", "--help"], { env, encoding: "utf8" })),
		commands: Object.keys(JSON.parse(readFileSync(join(skillDir, "scripts", "command-metadata.json"), "utf8"))).sort(),
		engine: readFileSync(join(skillDir, "scripts", "VERSION"), "utf8").trim(),
	};
}

export function check(skillDir, baseline = BASELINE) {
	const current = snapshot(skillDir);
	const findings = [
		...diff("live event types", baseline.events, current.events),
		...diff("live-poll flags", baseline.pollFlags, current.pollFlags),
		...diff("skill commands", baseline.commands, current.commands),
	];
	return { current, findings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [skillDir, flag] = process.argv.slice(2);
	if (!skillDir) {
		console.error("usage: drift-check.mjs <skill-dir> [--print]");
		process.exit(2);
	}
	let result;
	try {
		result = check(skillDir);
	} catch (error) {
		console.error(`drift-check: ${error.message}`);
		process.exit(2);
	}
	if (flag === "--print") {
		console.log(JSON.stringify(result.current, null, 2));
		process.exit(0);
	}
	if (!result.findings.length) {
		console.log(`no drift (engine ${result.current.engine}, baseline engine ${BASELINE.engine})`);
		process.exit(0);
	}
	for (const { name, added, removed } of result.findings) {
		console.log(`${name}:`);
		for (const x of added) console.log(`  + ${x}`);
		for (const x of removed) console.log(`  - ${x}`);
	}
	console.log("\nUpstream changed. Review extensions/ against it, then refresh scripts/baseline.json (--print).");
	process.exit(1);
}
