const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { scrubCommand, scrubMessage } = require("../src/scrub");
const { runHook, tempDir } = require("./helpers");

const bashPre = (cwd, command) => ({
	hook_event_name: "PreToolUse",
	tool_name: "Bash",
	cwd,
	tool_input: { command },
});

test("keeps subject lines whose component prefix starts with ai- or claude-", () => {
	const text = "ai-gateway: fix timeout\n\nclaude-client: bump version\n";
	assert.equal(scrubMessage(text), text);
	assert.equal(
		scrubMessage(
			"feat: x\n\nAI-Assisted: yes\nClaude-Session: abc\nX-AI-Tool: codex\n",
		),
		"feat: x\n",
	);
});

test("keeps trailers of people at AI companies and strips bot identities", () => {
	const text = [
		"fix: thing",
		"",
		"Co-authored-by: Jane Roe <jane@cursor.com>",
		"Reviewed-by: Sam Poe <sam@anthropic.com>",
		"Co-authored-by: Ada <ada@openai.com>",
	].join("\n");
	assert.equal(scrubMessage(text), text);
	const bots =
		"fix: y\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nCo-authored-by: Copilot\nCo-authored-by: Cursor <cursoragent@cursor.com>\n";
	assert.equal(scrubMessage(bots), "fix: y\n");
});

test("keeps technical sentences that mention AI products", () => {
	const text =
		"Built with the OpenAI SDK, the client streams tokens to the UI.\nPowered by Gemini for summaries.\n";
	assert.equal(scrubMessage(text), text);
	const footers =
		"Adds it.\n\nGenerated with [Claude Code](https://claude.com/claude-code)\nCreated by Copilot\n";
	assert.equal(scrubMessage(footers), "Adds it.\n");
});

test("leaves commands alone when git only appears inside a heredoc body", () => {
	const cmd =
		"cat > notes.md <<'EOF'\nRun git commit later — see docs ✨\n\nCo-authored-by: Claude <noreply@anthropic.com>\nEOF";
	assert.equal(scrubCommand(cmd), cmd);
	assert.equal(runHook("pre-tool-use.js", bashPre(tempDir(), cmd)), null);
});

test("skips message files that are not valid UTF-8", () => {
	const dir = tempDir();
	const file = path.join(dir, "msg.txt");
	const bytes = Buffer.concat([
		Buffer.from(
			"feat: bin\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n",
		),
		Buffer.from([0xff, 0xfe, 0x00]),
	]);
	fs.writeFileSync(file, bytes);
	assert.equal(
		runHook("pre-tool-use.js", bashPre(dir, "git commit -F msg.txt")),
		null,
	);
	assert.ok(fs.readFileSync(file).equals(bytes));
});
