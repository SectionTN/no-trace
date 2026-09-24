const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { debug } = require("./hook");
const { maskHeredocBodies, scrubMessage } = require("./scrub");

// Only subcommands that read a message or body from a file; `git grep -F` and `gh api -F` mean something else.
const FILE_ARG =
	/\b(?:git\s+(?:-[cC]\s+\S+\s+|-\S+\s+)*(?:commit|tag|merge|notes|am|revert|cherry-pick)\b|gh\s+(?:pr|issue|release)\s+\S+|glab\s+(?:mr|issue|release)\s+\S+)[^;&|\n]*?\s(?:-F|--file|--body-file|--notes-file)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/g;
const CD_STEP =
	/(?:^|&&|\|\||;|\n)\s*cd(?:\s+-[LP]+)?(?:\s+(?:"([^"]*)"|'([^']*)'|([^\s;&|]+)))?(?=[\s;&|]|$)/g;
const GIT_C =
	/^git\s+(?:-c\s+\S+\s+|-\S+\s+)*?-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/;
const MAX_BYTES = 256 * 1024;

// A bare cd goes home; "-" and anything with shell expansion cannot be resolved without a shell.
function resolveArg(raw, from) {
	if (raw === undefined) return os.homedir();
	if (raw === "-" || /[$`]/.test(raw)) return null;
	return path.resolve(from, raw.replace(/^~(?=$|\/)/, os.homedir()));
}

// Directory the git invocation at `at` of a heredoc-masked command runs in. Null when a cd step cannot be resolved.
function gitDir(masked, cwd, at = 0) {
	let dir = cwd;
	for (const m of masked.matchAll(CD_STEP)) {
		if (m.index >= at) break;
		dir = resolveArg(m[1] ?? m[2] ?? m[3], dir);
		if (dir === null) return null;
	}
	const c = GIT_C.exec(masked.slice(at));
	return c ? resolveArg(c[1] || c[2] || c[3], dir) : dir;
}

// Scrubs message files named by -F/--file/--body-file/--notes-file in place. Returns the paths changed.
function scrubMessageFiles(command, cwd, opts) {
	const changed = [];
	const masked = maskHeredocBodies(command);
	for (const m of masked.matchAll(FILE_ARG)) {
		const file = m[1] || m[2] || m[3];
		const base = gitDir(masked, cwd, m.index);
		if (!base || file === "-" || file.startsWith("/dev/")) continue;
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
