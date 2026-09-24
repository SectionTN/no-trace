#!/usr/bin/env node

const { fixCommit } = require("./commit");
const { fixGithubObjects } = require("./github");
const { emit, options, readInput } = require("./hook");

const input = readInput();
if (input && input.tool_name === "Bash") {
	const command = String(input.tool_input?.command || "");
	const cwd = input.cwd || process.cwd();
	const opts = options();
	const reports = [
		...fixCommit(command, cwd, opts),
		...fixGithubObjects(command, input.tool_response, opts),
	];
	if (reports.length) {
		emit("PostToolUse", {
			additionalContext: reports
				.map((report) => `no-trace: ${report}`)
				.join("\n"),
		});
	}
}
