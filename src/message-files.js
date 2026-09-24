const fs = require("node:fs");
const path = require("node:path");
const { debug } = require("./hook");
const { scrubMessage } = require("./scrub");

const FILE_ARG =
	/\b(?:git|gh|glab)\s+[^;&|\n]*?(?:-F|--file|--body-file|--notes-file)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/g;
const GIT_DIR = /\bgit\s+(?:-\S+\s+)*?-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/;
const MAX_BYTES = 256 * 1024;

// Directory git commands run in: honours `git -C <dir>`, otherwise the hook cwd.
function gitDir(command, cwd) {
	const m = GIT_DIR.exec(command);
	const dir = m && (m[1] || m[2] || m[3]);
	return dir ? path.resolve(cwd, dir) : cwd;
}

// Scrubs message files named by -F/--file/--body-file/--notes-file in place. Returns the paths changed.
function scrubMessageFiles(command, cwd, opts) {
	const changed = [];
	const base = gitDir(command, cwd);
	for (const m of command.matchAll(FILE_ARG)) {
		const file = m[1] || m[2] || m[3];
		if (file === "-" || file.startsWith("/dev/")) continue;
		const full = path.resolve(base, file);
		let stat;
		try {
			stat = fs.statSync(full);
		} catch {
			continue;
		}
		if (!stat.isFile() || stat.size > MAX_BYTES) continue;
		const text = fs.readFileSync(full, "utf8");
		const next = scrubMessage(text, opts);
		if (next === text) continue;
		fs.writeFileSync(full, next);
		changed.push(file);
		debug(`scrubbed ${full}`);
	}
	return changed;
}

module.exports = { gitDir, scrubMessageFiles };
