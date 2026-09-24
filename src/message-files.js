const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { debug } = require("./hook");
const { scrubMessage } = require("./scrub");

const FILE_ARG =
	/\b(?:git|gh|glab)\s+[^;&|\n]*?(?:-F|--file|--body-file|--notes-file)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/g;
const CD_STEP =
	/(?:^|&&|\|\||;|\n)\s*cd(?:\s+(?:"([^"]*)"|'([^']*)'|([^\s;&|]+)))?(?=[\s;&|]|$)/g;
const GIT_C = /^git\s+(?:-\S+\s+)*?-C\s+(?:"([^"]+)"|'([^']+)'|(\S+))/;
const MAX_BYTES = 256 * 1024;

// A bare cd goes home; "-" and anything with shell expansion cannot be resolved without a shell.
function resolveArg(raw, from) {
	if (raw === undefined) return os.homedir();
	if (raw === "-" || /[$`]/.test(raw)) return null;
	return path.resolve(from, raw.replace(/^~(?=$|\/)/, os.homedir()));
}

// Directory the git invocation starting at `at` runs in: earlier cd steps plus its own -C. Null when unresolvable.
function gitDir(command, cwd, at = 0) {
	let dir = cwd;
	for (const m of command.matchAll(CD_STEP)) {
		if (m.index >= at) break;
		dir = resolveArg(m[1] ?? m[2] ?? m[3], dir);
		if (dir === null) return null;
	}
	const c = GIT_C.exec(command.slice(at));
	return c ? resolveArg(c[1] || c[2] || c[3], dir) : dir;
}

// Scrubs message files named by -F/--file/--body-file/--notes-file in place. Returns the paths changed.
function scrubMessageFiles(command, cwd, opts) {
	const changed = [];
	for (const m of command.matchAll(FILE_ARG)) {
		const file = m[1] || m[2] || m[3];
		const base = gitDir(command, cwd, m.index);
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
