const { spawnSync, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TRAILER = "Co-Authored-By: Claude <noreply@anthropic.com>";
const FOOTER =
	"🤖 Generated with [Claude Code](https://claude.com/claude-code)";
const SRC = path.join(__dirname, "..", "src");

const GIT_ENV = {
	GIT_CONFIG_GLOBAL: os.devNull,
	GIT_CONFIG_SYSTEM: os.devNull,
	GIT_AUTHOR_NAME: "Test",
	GIT_AUTHOR_EMAIL: "test@example.com",
	GIT_COMMITTER_NAME: "Test",
	GIT_COMMITTER_EMAIL: "test@example.com",
};

const heredocCommit = (body) =>
	`git commit -m "$(cat <<'EOF'\n${body}\nEOF\n)"`;
const tempDir = (prefix = "no-trace-") =>
	fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function runHookRaw(script, payload, env = {}) {
	const result = spawnSync(process.execPath, [path.join(SRC, script)], {
		input: typeof payload === "string" ? payload : JSON.stringify(payload),
		env: { ...process.env, ...GIT_ENV, ...env },
		encoding: "utf8",
	});
	if (result.status !== 0)
		throw new Error(`${script} exited ${result.status}: ${result.stderr}`);
	return { stdout: result.stdout, stderr: result.stderr };
}

function runHook(script, payload, env = {}) {
	const { stdout } = runHookRaw(script, payload, env);
	return stdout.trim() ? JSON.parse(stdout) : null;
}

function git(cwd, args, extra = {}) {
	return execFileSync("git", args, {
		cwd,
		encoding: "utf8",
		input: extra.input,
		env: { ...process.env, ...GIT_ENV, ...extra.env },
	}).trim();
}

function tempRepo(commitEnv = {}) {
	const dir = tempDir();
	git(dir, ["init", "-q", "-b", "main"]);
	fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
	git(dir, ["add", "a.txt"]);
	git(dir, ["commit", "-q", "-F", "-"], {
		input: `feat: x\n\n${TRAILER}\n`,
		env: commitEnv,
	});
	return dir;
}

const bashCall = (cwd, command, toolResponse = {}) => ({
	hook_event_name: "PostToolUse",
	tool_name: "Bash",
	cwd,
	tool_input: { command },
	tool_response: toolResponse,
});

// Puts a fake gh on PATH that serves GET fixtures and logs every call with its stdin.
function fakeGh(fixtures) {
	const dir = tempDir("no-trace-gh-");
	const log = path.join(dir, "calls.jsonl");
	const script = [
		"#!/usr/bin/env node",
		'const fs = require("node:fs");',
		"const args = process.argv.slice(2);",
		'let stdin = "";',
		'try { stdin = fs.readFileSync(0, "utf8"); } catch {}',
		'fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify({ args, stdin }) + "\\n");',
		"const fixtures = JSON.parse(process.env.FAKE_GH_FIXTURES);",
		'const method = args.includes("-X") ? args[args.indexOf("-X") + 1] : "GET";',
		'const target = args.find((a) => a.startsWith("repos/"));',
		'if (method !== "GET" && process.env.FAKE_GH_FAIL_PATCH) { process.stderr.write("HTTP 422\\n"); process.exit(1); }',
		'if (method !== "GET") { process.stdout.write("{}"); process.exit(0); }',
		'if (!(target in fixtures)) { process.stderr.write("HTTP 404\\n"); process.exit(1); }',
		"process.stdout.write(JSON.stringify(fixtures[target]));",
		"",
	].join("\n");
	fs.writeFileSync(path.join(dir, "gh"), script, { mode: 0o755 });
	const env = {
		PATH: `${dir}${path.delimiter}${process.env.PATH}`,
		FAKE_GH_LOG: log,
		FAKE_GH_FIXTURES: JSON.stringify(fixtures),
	};
	const calls = () =>
		fs.existsSync(log)
			? fs
					.readFileSync(log, "utf8")
					.trim()
					.split("\n")
					.filter(Boolean)
					.map((line) => JSON.parse(line))
			: [];
	return { env, calls };
}

module.exports = {
	TRAILER,
	FOOTER,
	GIT_ENV,
	heredocCommit,
	tempDir,
	runHook,
	runHookRaw,
	git,
	tempRepo,
	bashCall,
	fakeGh,
};
