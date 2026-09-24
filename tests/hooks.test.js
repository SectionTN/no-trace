const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
	TRAILER,
	FOOTER,
	runHook,
	runHookRaw,
	tempDir,
	bashCall,
	fakeGh,
	git,
	tempRepo,
} = require("./helpers");

const bashPre = (cwd, command) => ({
	hook_event_name: "PreToolUse",
	tool_name: "Bash",
	cwd,
	tool_input: { command },
});
const PR_URL = "https://github.com/octo/repo/pull/12";

test("pre-tool-use scrubs a git -F message file in place", () => {
	const dir = tempDir();
	fs.writeFileSync(path.join(dir, "msg.txt"), `feat: x — y\n\n${TRAILER}\n`);
	const out = runHook("pre-tool-use.js", bashPre(dir, "git commit -F msg.txt"));
	assert.equal(
		fs.readFileSync(path.join(dir, "msg.txt"), "utf8"),
		"feat: x - y\n",
	);
	assert.match(out.hookSpecificOutput.additionalContext, /msg\.txt/);
	assert.equal(out.hookSpecificOutput.updatedInput, undefined);
});

test("pre-tool-use scrubs gh --body-file and resolves git -C paths", () => {
	const dir = tempDir();
	fs.mkdirSync(path.join(dir, "repo"));
	fs.writeFileSync(path.join(dir, "body.md"), `Adds it.\n\n${FOOTER}\n`);
	fs.writeFileSync(path.join(dir, "repo", "msg.txt"), `feat: y ✨\n`);
	runHook(
		"pre-tool-use.js",
		bashPre(dir, 'gh pr create --title "t" --body-file "body.md"'),
	);
	runHook("pre-tool-use.js", bashPre(dir, "git -C repo commit -F msg.txt"));
	assert.equal(
		fs.readFileSync(path.join(dir, "body.md"), "utf8"),
		"Adds it.\n",
	);
	assert.equal(
		fs.readFileSync(path.join(dir, "repo", "msg.txt"), "utf8"),
		"feat: y\n",
	);
});

test("pre-tool-use ignores stdin, device paths and missing files", () => {
	const dir = tempDir();
	assert.equal(
		runHook("pre-tool-use.js", bashPre(dir, "git commit -F -")),
		null,
	);
	assert.equal(
		runHook("pre-tool-use.js", bashPre(dir, "git commit -F /dev/null")),
		null,
	);
	assert.equal(
		runHook("pre-tool-use.js", bashPre(dir, "git commit -F missing.txt")),
		null,
	);
});

test("pre-tool-use leaves a clean message file untouched", () => {
	const dir = tempDir();
	const file = path.join(dir, "msg.txt");
	fs.writeFileSync(file, "feat: clean\n\nBody.\n");
	const before = fs.statSync(file).mtimeMs;
	assert.equal(
		runHook("pre-tool-use.js", bashPre(dir, "git commit -F msg.txt")),
		null,
	);
	assert.equal(fs.statSync(file).mtimeMs, before);
});

test("post-tool-use edits a PR whose title and body still carry attribution", () => {
	const gh = fakeGh({
		"repos/octo/repo/pulls/12": {
			title: "✨ Add parser",
			body: `Adds it.\n\n${FOOTER}`,
		},
	});
	const call = bashCall(
		tempDir(),
		'gh pr create --title "t" --body-file b.md',
		{ stdout: `${PR_URL}\n`, stderr: "" },
	);
	const out = runHook("post-tool-use.js", call, gh.env);
	const patch = gh.calls().find((c) => c.args.includes("PATCH"));
	assert.deepEqual(patch.args, [
		"api",
		"-X",
		"PATCH",
		"repos/octo/repo/pulls/12",
		"--input",
		"-",
	]);
	assert.deepEqual(JSON.parse(patch.stdin), {
		title: "Add parser",
		body: "Adds it.",
	});
	assert.match(out.hookSpecificOutput.additionalContext, /PR #12/);
	assert.match(out.hookSpecificOutput.additionalContext, /edit history/);
});

test("post-tool-use edits an issue comment and a release", () => {
	const gh = fakeGh({
		"repos/octo/repo/issues/comments/555": {
			body: `Looks good.\n\n${TRAILER}`,
		},
		"repos/octo/repo/releases/tags/v1.0.0": {
			id: 77,
			name: "v1.0.0 🎉",
			body: "Notes — first release.",
		},
	});
	runHook(
		"post-tool-use.js",
		bashCall(tempDir(), "gh pr comment 12 --body x", {
			stdout: `${PR_URL}#issuecomment-555\n`,
		}),
		gh.env,
	);
	runHook(
		"post-tool-use.js",
		bashCall(tempDir(), "gh release create v1.0.0 -F notes.md", {
			stdout: "https://github.com/octo/repo/releases/tag/v1.0.0\n",
		}),
		gh.env,
	);
	const patches = gh.calls().filter((c) => c.args.includes("PATCH"));
	assert.deepEqual(
		patches.map((c) => [c.args[3], JSON.parse(c.stdin)]),
		[
			["repos/octo/repo/issues/comments/555", { body: "Looks good." }],
			[
				"repos/octo/repo/releases/77",
				{ name: "v1.0.0", body: "Notes - first release." },
			],
		],
	);
});

test("post-tool-use leaves clean GitHub objects alone and skips commands without a URL", () => {
	const gh = fakeGh({
		"repos/octo/repo/pulls/12": { title: "Add parser", body: "Adds it." },
	});
	assert.equal(
		runHook(
			"post-tool-use.js",
			bashCall(tempDir(), "gh pr create --fill", { stdout: `${PR_URL}\n` }),
			gh.env,
		),
		null,
	);
	assert.equal(gh.calls().filter((c) => c.args.includes("PATCH")).length, 0);
	assert.equal(
		runHook(
			"post-tool-use.js",
			bashCall(tempDir(), "gh pr list", { stdout: "#12 Add parser\n" }),
			gh.env,
		),
		null,
	);
	assert.equal(gh.calls().length, 1);
});

test("post-tool-use reports when GitHub cannot be read back", () => {
	const gh = fakeGh({});
	const call = bashCall(tempDir(), "gh issue create --title t --body b", {
		stdout: "https://github.com/octo/repo/issues/3\n",
	});
	const out = runHook("post-tool-use.js", call, gh.env);
	assert.match(
		out.hookSpecificOutput.additionalContext,
		/could not verify issue #3/,
	);
});

test("session-start emits the rules as additional context", () => {
	const out = runHook("session-start.js", {});
	assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
	assert.match(
		out.hookSpecificOutput.additionalContext,
		/^no-trace plugin active/,
	);
});

test("NO_TRACE_DEBUG=1 logs to stderr and never to stdout", () => {
	const { stdout, stderr } = runHookRaw("pre-tool-use.js", "not json", {
		NO_TRACE_DEBUG: "1",
	});
	assert.equal(stdout.trim(), "");
	assert.match(stderr, /no-trace: /);
});

test("pre-tool-use follows cd steps before git and ignores cd after it", () => {
	const dir = tempDir();
	fs.mkdirSync(path.join(dir, "repo"));
	fs.writeFileSync(
		path.join(dir, "repo", "msg.txt"),
		`feat: z\n\n${TRAILER}\n`,
	);
	fs.writeFileSync(path.join(dir, "msg.txt"), "feat: root ✨\n");
	runHook(
		"pre-tool-use.js",
		bashPre(
			tempDir(),
			`cd "${dir}" && cd repo && git commit -F msg.txt && cd ..`,
		),
	);
	assert.equal(
		fs.readFileSync(path.join(dir, "repo", "msg.txt"), "utf8"),
		"feat: z\n",
	);
	assert.equal(
		fs.readFileSync(path.join(dir, "msg.txt"), "utf8"),
		"feat: root ✨\n",
	);
});

test("pre-tool-use leaves files alone when a cd target cannot be resolved", () => {
	const dir = tempDir();
	fs.writeFileSync(path.join(dir, "msg.txt"), `feat: q\n\n${TRAILER}\n`);
	assert.equal(
		runHook(
			"pre-tool-use.js",
			bashPre(dir, 'cd "$REPO" && git commit -F msg.txt'),
		),
		null,
	);
	assert.match(
		fs.readFileSync(path.join(dir, "msg.txt"), "utf8"),
		/Co-Authored-By/,
	);
});

test("post-tool-use follows cd before git commit", () => {
	const repo = tempRepo();
	const out = runHook(
		"post-tool-use.js",
		bashCall(tempDir(), `cd ${repo} && git commit -m x`),
	);
	assert.equal(git(repo, ["log", "-1", "--format=%B"]), "feat: x");
	assert.match(out.hookSpecificOutput.additionalContext, /amended/);
});
