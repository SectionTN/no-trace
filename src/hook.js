const { readFileSync } = require("node:fs");

const debug = (message) => {
	if (process.env.NO_TRACE_DEBUG === "1")
		process.stderr.write(`no-trace: ${message}\n`);
};

// Hook input arrives as JSON on stdin; anything unreadable means "do nothing".
function readInput() {
	try {
		return JSON.parse(readFileSync(0, "utf8"));
	} catch (error) {
		debug(`unreadable hook input: ${error.message}`);
		return null;
	}
}

function emit(hookEventName, fields) {
	process.stdout.write(
		JSON.stringify({ hookSpecificOutput: { hookEventName, ...fields } }),
	);
}

const options = () => ({ style: process.env.NO_TRACE_STYLE !== "0" });

module.exports = { debug, readInput, emit, options };
