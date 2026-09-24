#!/usr/bin/env node

const { emit, options, readInput } = require("./hook");
const { scrubMessageFiles } = require("./message-files");
const { isGitCommand, maskHeredocBodies, scrubToolInput } = require("./scrub");

const input = readInput();
if (input) {
	const opts = options();
	const fields = {};
	const result = scrubToolInput(input.tool_name, input.tool_input, opts);
	if (result.changed) fields.updatedInput = result.input;
	const command =
		input.tool_name === "Bash" ? String(input.tool_input?.command || "") : "";
	if (isGitCommand(maskHeredocBodies(command))) {
		const files = scrubMessageFiles(command, input.cwd || process.cwd(), opts);
		if (files.length) {
			fields.additionalContext = `no-trace: removed AI attribution or non-ASCII punctuation from ${files.join(", ")} before use.`;
		}
	}
	if (Object.keys(fields).length) emit("PreToolUse", fields);
}
