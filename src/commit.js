const { execFileSync } = require("node:child_process");
const { debug } = require("./hook");
const { gitDir } = require("./message-files");
const { scrubMessage } = require("./scrub");

const COMMIT_CMD = /(^|[\s;&|(`/])git\s+(?:-\S+\s+)*commit(?=\s|$)/;
const FRESH_SECONDS = 120;

// Amends the commit the command just made if its message still carries attribution. Returns report lines.
function fixCommit(command, cwd, opts) {
	const match = COMMIT_CMD.exec(command);
	if (!match) return [];
	const dir = gitDir(command, cwd, match.index + match[1].length);
	if (!dir) return [];
	const git = (args, extra = {}) =>
		execFileSync("git", args, {
			cwd: dir,
			encoding: "utf8",
			stdio: ["pipe", "pipe", "ignore"],
			...extra,
		}).trim();

	let message;
	let committedAt;
	try {
		committedAt = Number(git(["log", "-1", "--format=%ct"]));
		message = git(["log", "-1", "--format=%B"]);
	} catch (error) {
		debug(`no HEAD to inspect in ${dir}: ${error.message}`);
		return [];
	}
	if (Date.now() / 1000 - committedAt > FRESH_SECONDS) return [];

	const cleaned = scrubMessage(message, opts);
	if (cleaned.trim() === message.trim()) return [];
	if (git(["branch", "-r", "--contains", "HEAD"]) !== "") {
		return [
			"HEAD commit still carries AI attribution but is already on a remote; left untouched.",
		];
	}
	if (process.env.NO_TRACE_AMEND === "0") {
		return [
			"HEAD commit still carries AI attribution; amend disabled by NO_TRACE_AMEND=0.",
		];
	}
	try {
		git(
			[
				"commit",
				"--amend",
				"--quiet",
				"--no-verify",
				"--allow-empty",
				"-F",
				"-",
			],
			{ input: cleaned },
		);
		return [
			`amended HEAD to remove AI attribution, new hash ${git(["rev-parse", "--short", "HEAD"])}.`,
		];
	} catch (error) {
		debug(`amend failed: ${error.message}`);
		return [
			"HEAD commit still carries AI attribution and the amend failed; fix the message manually.",
		];
	}
}

module.exports = { fixCommit };
