const AI =
	"(?:claude|anthropic|copilot|chatgpt|openai|codex|gemini|cursor|aider|devin|windsurf|cline|kiro|jules|amazon\\s?q|codewhisperer|opencode|noreply@anthropic\\.com)";
const AI_VALUE_KEYS =
	"(?:co-?authored-by|signed-off-by|reviewed-by|helped-by|paired-with|pair-programmed-with|authored-by|co-?developed-by|tested-by|suggested-by|acked-by|generated-by|generated-with|made-with|assisted-by|created-by|written-by|drafted-by)";
const AI_KEYS = "(?:claude[a-z0-9-]*|ai-[a-z-]+|x-ai[a-z-]*)";
const VERBS =
	"(?:generated|created|made|built|written|drafted|authored|assisted|powered|produced|co-?authored|co-?written)";
const LEAD = "^[\\p{Extended_Pictographic}\\uFE0F\\s]*(?:<!--\\s*)?";

const ATTRIBUTION = [
	new RegExp(`${LEAD}${AI_VALUE_KEYS}\\s*:.*${AI}`, "iu"),
	new RegExp(`${LEAD}${AI_KEYS}\\s*:\\s*\\S`, "iu"),
	new RegExp(
		`${LEAD}(?:this\\s+\\w+\\s+(?:was|is)\\s+)?${VERBS}\\s+(?:with|by|using|via)\\b.*${AI}`,
		"iu",
	),
];

const DASHES = /[\u{2012}-\u{2015}]/gu;
const ELLIPSIS = /\u{2026}/gu;
const SINGLE_QUOTES = /[\u{2018}-\u{201B}]/gu;
const DOUBLE_QUOTES = /[\u{201C}-\u{201F}]/gu;
const ARROWS = [
	[/\u{2192}/gu, "->"],
	[/\u{2190}/gu, "<-"],
	[/\u{21D2}/gu, "=>"],
	[/\u{2194}/gu, "<->"],
];
const EMOJI =
	/[ \t]*(?:(?![\u{A9}\u{AE}\u{2122}])[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]|\u{FE0F}|\u{200D}|\u{20E3})+[ \t]*/gu;

const OPENERS = new Set(['"', "'", "`", "(", "[", "{"]);
const CLOSERS = new Set(['"', "'", "`", ")", "]", "}"]);
const HEREDOC = /(?<!<)<<(?!<)-?\s*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_]\w*))/g;
const MSG_ARG =
	/\s+(?:-m|--message=?|--trailer=?)\s*(["'])((?:(?!\1)[^\n])*)\1/g;
const GIT_CMD = /(^|[\s;&|(`/])(?:git|gh|glab)(?=\s)/;
const MCP_TOOL =
	/^mcp__.*(?:git|github|gitlab|gitea|bitbucket|pull_request|issue|commit)/i;
const TEXT_KEYS = [
	"body",
	"message",
	"commit_message",
	"commitMessage",
	"title",
	"description",
	"text",
	"comment",
	"note",
	"summary",
];

const isBlank = (line) => line.trim() === "";
const isAttributionLine = (line) => ATTRIBUTION.some((re) => re.test(line));
const hasAttribution = (text) =>
	String(text).split("\n").some(isAttributionLine);
const isGitCommand = (cmd) => GIT_CMD.test(cmd);
const isTerminator = (line, term) => line.replace(/^\t+/, "") === term;

function stripEmoji(line) {
	return line.replace(EMOJI, (match, offset, str) => {
		const before = str[offset - 1];
		const after = str[offset + match.length];
		const edge =
			before === undefined ||
			after === undefined ||
			OPENERS.has(before) ||
			CLOSERS.has(after);
		return edge ? "" : " ";
	});
}

// shellSafe skips replacements that could change shell quoting or redirects.
function styleLine(line, shellSafe) {
	let out = stripEmoji(line.replace(DASHES, "-").replace(ELLIPSIS, "..."));
	if (shellSafe) return out;
	out = out.replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"');
	for (const [re, rep] of ARROWS) out = out.replace(re, rep);
	return out.replace(/[ \t]+$/, "");
}

// Splits a closing quote (plus optional subshell paren) off a shell line so it survives removal.
function splitTail(line) {
	const m = /^(.*?)(["']\)?["']?)$/.exec(line);
	return m ? [m[1], m[2]] : [line, ""];
}

function popBlank(out, floor) {
	while (out.length > floor && isBlank(out[out.length - 1])) out.pop();
}

// Returns the index to resume from after dropping lines[i], swallowing one blank neighbour.
function skipBlank(lines, i, out, floor) {
	const next = lines[i + 1];
	const prevBlank = out.length === floor || isBlank(out[out.length - 1]);
	return next !== undefined && isBlank(next) && prevBlank ? i + 1 : i;
}

// Heredoc bodies get the full treatment, other shell lines only the shell-safe subset.
function processLines(lines, style, shell) {
	const out = [];
	const pending = [];
	let term = null;
	let bodyStart = 0;
	let dropped = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const inBody = !shell || term !== null;

		if (inBody && term !== null && isTerminator(line, term)) {
			if (dropped) popBlank(out, bodyStart);
			out.push(line);
			term = pending.length ? pending.shift() : null;
			bodyStart = out.length;
			dropped = false;
			continue;
		}

		if (inBody) {
			if (isAttributionLine(line)) {
				i = skipBlank(lines, i, out, bodyStart);
				dropped = true;
			} else {
				out.push(style ? styleLine(line, false) : line);
			}
			continue;
		}

		for (const m of line.matchAll(HEREDOC)) pending.push(m[1] || m[2] || m[3]);
		const [core, tail] = splitTail(line);
		if (isAttributionLine(core)) {
			popBlank(out, 0);
			if (tail) out.push(tail);
		} else {
			out.push(style ? styleLine(line, true) : line);
		}
		if (pending.length) {
			term = pending.shift();
			bodyStart = out.length;
		}
	}
	if (!shell && dropped) popBlank(out, 0);
	return out;
}

function scrubCommand(cmd, opts = {}) {
	if (typeof cmd !== "string" || !isGitCommand(cmd)) return cmd;
	const cleaned = cmd.replace(MSG_ARG, (m, _q, val) =>
		isAttributionLine(val) ? "" : m,
	);
	return processLines(cleaned.split("\n"), opts.style !== false, true).join(
		"\n",
	);
}

function scrubMessage(text, opts = {}) {
	if (typeof text !== "string") return text;
	const out = processLines(text.split("\n"), opts.style !== false, false).join(
		"\n",
	);
	return text.endsWith("\n") && !out.endsWith("\n") ? `${out}\n` : out;
}

function scrubToolInput(toolName, toolInput, opts = {}) {
	const unchanged = { changed: false, input: toolInput };
	if (!toolInput || typeof toolInput !== "object") return unchanged;
	if (toolName === "Bash") {
		const command = scrubCommand(toolInput.command, opts);
		return command === toolInput.command
			? unchanged
			: { changed: true, input: { ...toolInput, command } };
	}
	if (!MCP_TOOL.test(String(toolName))) return unchanged;
	const input = { ...toolInput };
	let changed = false;
	for (const key of TEXT_KEYS) {
		if (typeof input[key] !== "string") continue;
		const next = scrubMessage(input[key], opts);
		if (next !== input[key]) {
			input[key] = next;
			changed = true;
		}
	}
	return changed ? { changed, input } : unchanged;
}

module.exports = {
	scrubCommand,
	scrubMessage,
	scrubToolInput,
	hasAttribution,
	isAttributionLine,
	isGitCommand,
};
