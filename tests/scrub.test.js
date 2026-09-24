const test = require("node:test");
const assert = require("node:assert/strict");
const {
	scrubMessage,
	scrubCommand,
	scrubToolInput,
	hasAttribution,
} = require("../src/scrub");
const {
	TRAILER,
	FOOTER,
	heredocCommit,
	runHook,
	git,
	tempRepo,
	tempDir,
	bashCall,
} = require("./helpers");

test("removes Claude co-author trailer from heredoc commit", () => {
	const cmd = heredocCommit(`feat: add parser\n\nSome body.\n\n${TRAILER}`);
	assert.equal(
		scrubCommand(cmd),
		heredocCommit("feat: add parser\n\nSome body."),
	);
});

test("removes generated-with footer from gh pr body", () => {
	const cmd = `gh pr create --title "Add parser" --body "$(cat <<'EOF'\nAdds the parser.\n\n${FOOTER}\nEOF\n)"`;
	assert.equal(
		scrubCommand(cmd),
		`gh pr create --title "Add parser" --body "$(cat <<'EOF'\nAdds the parser.\nEOF\n)"`,
	);
});

test("removes trailer passed as separate -m and --trailer args", () => {
	const cmd = `git commit -m "fix: thing" -m "${TRAILER}" --trailer "Co-authored-by: Claude <noreply@anthropic.com>"`;
	assert.equal(scrubCommand(cmd), 'git commit -m "fix: thing"');
});

test("keeps human co-author and sign-off trailers", () => {
	const body =
		"fix: thing\n\nCo-authored-by: Jane Doe <jane@example.com>\nSigned-off-by: John Roe <john@example.com>";
	assert.equal(scrubCommand(heredocCommit(body)), heredocCommit(body));
});

test("strips Claude-Session, AI-assisted and generated-by trailers", () => {
	const body =
		"fix: thing\n\nClaude-Session: abc123\nAI-Assisted: yes\nGenerated-By: Copilot";
	assert.equal(scrubCommand(heredocCommit(body)), heredocCommit("fix: thing"));
});

test("replaces em and en dashes and ellipsis", () => {
	const body = "fix: parser — handle ranges 60–90…";
	assert.equal(
		scrubCommand(heredocCommit(body)),
		heredocCommit("fix: parser - handle ranges 60-90..."),
	);
});

test("removes emoji and fixes surrounding spacing", () => {
	const body =
		"✨ feat: add thing 🎉\n\n- item one 🚀\n- 🔥 item two\n- item ✅ three";
	assert.equal(
		scrubCommand(heredocCommit(body)),
		heredocCommit("feat: add thing\n\n- item one\n- item two\n- item three"),
	);
});

test("keeps copyright and trademark symbols", () => {
	const body = "docs: add © 2026 notice and ™ mark";
	assert.equal(scrubCommand(heredocCommit(body)), heredocCommit(body));
});

test("straightens curly quotes and arrows inside heredocs only", () => {
	const prefix = `git commit -m 'don’t' && `;
	const cmd = prefix + heredocCommit("fix: “quoted” → done");
	assert.equal(
		scrubCommand(cmd),
		prefix + heredocCommit('fix: "quoted" -> done'),
	);
});

test("keeps closing quote when trailer ends a multi-line quoted message", () => {
	const cmd = `git commit -m "feat: x\n\n${TRAILER}"`;
	assert.equal(scrubCommand(cmd), 'git commit -m "feat: x\n"');
});

test("leaves non-git commands untouched", () => {
	const cmd = 'grep -rn "—" src/ && echo "✨ done"';
	assert.equal(scrubCommand(cmd), cmd);
});

test("leaves clean git commands untouched", () => {
	const cmd = heredocCommit("feat: clean message\n\nBody here.");
	assert.equal(scrubCommand(cmd), cmd);
});

test("style scrub outside heredocs only touches lines that invoke git or gh", () => {
	const cmd = 'grep -n "ℹ" out.log\ngit commit -m "feat: x ✨"';
	assert.equal(
		scrubCommand(cmd),
		'grep -n "ℹ" out.log\ngit commit -m "feat: x"',
	);
});

test("is idempotent", () => {
	const once = scrubCommand(
		heredocCommit(`✨ feat: x — y\n\n${FOOTER}\n\n${TRAILER}`),
	);
	assert.equal(scrubCommand(once), once);
});

test("style scrub can be disabled while attribution stripping stays on", () => {
	const cmd = heredocCommit(`✨ feat: x — y\n\n${TRAILER}`);
	assert.equal(
		scrubCommand(cmd, { style: false }),
		heredocCommit("✨ feat: x — y"),
	);
});

test("scrubMessage cleans free text and collapses blank lines", () => {
	const text = `## Summary\n\nDoes a thing — nicely.\n\n\n\n${FOOTER}\n\n${TRAILER}\n`;
	assert.equal(scrubMessage(text), "## Summary\n\nDoes a thing - nicely.\n");
});

test("scrubToolInput rewrites text fields of GitHub MCP tools only", () => {
	const input = {
		owner: "o",
		repo: "r",
		title: "✨ Add parser",
		body: `Adds it.\n\n${FOOTER}`,
		head: "feat",
		base: "main",
	};
	const result = scrubToolInput(
		"mcp__plugin_github_github__create_pull_request",
		input,
	);
	assert.equal(result.changed, true);
	assert.deepEqual(result.input, {
		...input,
		title: "Add parser",
		body: "Adds it.",
	});
	assert.equal(
		scrubToolInput("mcp__claude_ai_Gmail__send_message", { body: FOOTER })
			.changed,
		false,
	);
});

test("hasAttribution detects AI trailers and footers but not humans", () => {
	assert.equal(hasAttribution(`feat: x\n\n${TRAILER}`), true);
	assert.equal(hasAttribution(`feat: x\n\n${FOOTER}`), true);
	assert.equal(
		hasAttribution("feat: x\n\nCo-authored-by: Jane <j@x.io>"),
		false,
	);
});

const headMessage = (dir) => git(dir, ["log", "-1", "--format=%B"]);

test("pre-tool-use hook returns updatedInput for a tainted Bash command", () => {
	const command = heredocCommit(`feat: x\n\n${TRAILER}`);
	const out = runHook("pre-tool-use.js", {
		hook_event_name: "PreToolUse",
		tool_name: "Bash",
		tool_input: { command, description: "commit" },
	});
	assert.deepEqual(out, {
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			updatedInput: {
				command: heredocCommit("feat: x"),
				description: "commit",
			},
		},
	});
});

test("pre-tool-use hook prints nothing for a clean command", () => {
	assert.equal(
		runHook("pre-tool-use.js", {
			hook_event_name: "PreToolUse",
			tool_name: "Bash",
			tool_input: { command: "git status" },
		}),
		null,
	);
});

test("pre-tool-use hook honours NO_TRACE_STYLE=0", () => {
	const command = heredocCommit("✨ feat: x");
	assert.equal(
		runHook(
			"pre-tool-use.js",
			{ tool_name: "Bash", tool_input: { command } },
			{ NO_TRACE_STYLE: "0" },
		),
		null,
	);
});

test("hooks survive malformed input", () => {
	assert.equal(runHook("pre-tool-use.js", "not json"), null);
	assert.equal(runHook("post-tool-use.js", "not json"), null);
});

test("post-tool-use hook amends a fresh unpushed commit that still carries a trailer", () => {
	const dir = tempRepo();
	const out = runHook(
		"post-tool-use.js",
		bashCall(dir, "git commit -F msg.txt"),
	);
	assert.equal(headMessage(dir), "feat: x");
	assert.match(out.hookSpecificOutput.additionalContext, /amended/);
});

test("post-tool-use hook leaves a pushed commit alone", () => {
	const dir = tempRepo();
	const remote = tempDir("no-trace-remote-");
	git(remote, ["init", "-q", "--bare"]);
	git(dir, ["remote", "add", "origin", remote]);
	git(dir, ["push", "-q", "-u", "origin", "main"]);
	const out = runHook("post-tool-use.js", bashCall(dir, "git commit -m x"));
	assert.match(headMessage(dir), /Co-Authored-By/);
	assert.match(out.hookSpecificOutput.additionalContext, /remote/);
});

test("post-tool-use hook ignores stale commits and non-commit commands", () => {
	const stale = tempRepo({ GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z" });
	assert.equal(
		runHook("post-tool-use.js", bashCall(stale, "git commit -m x")),
		null,
	);
	assert.match(headMessage(stale), /Co-Authored-By/);
	const fresh = tempRepo();
	assert.equal(
		runHook("post-tool-use.js", bashCall(fresh, "git status")),
		null,
	);
	assert.match(headMessage(fresh), /Co-Authored-By/);
});

test("post-tool-use hook honours NO_TRACE_AMEND=0", () => {
	const dir = tempRepo();
	const out = runHook("post-tool-use.js", bashCall(dir, "git commit -m x"), {
		NO_TRACE_AMEND: "0",
	});
	assert.match(headMessage(dir), /Co-Authored-By/);
	assert.match(out.hookSpecificOutput.additionalContext, /NO_TRACE_AMEND/);
});

test("post-tool-use hook is a no-op outside a git repo", () => {
	const dir = tempDir("no-trace-plain-");
	assert.equal(
		runHook("post-tool-use.js", bashCall(dir, "git commit -m x")),
		null,
	);
});
