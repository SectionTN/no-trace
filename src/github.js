const { execFileSync } = require("node:child_process");
const { debug } = require("./hook");
const { maskHeredocBodies, scrubMessage } = require("./scrub");

const GH_CMD = /\bgh\s+(?:pr|issue|release)\s+(?:create|edit|comment|review)\b/;
const OBJECT_URL =
	/https?:\/\/([\w.-]+)\/([\w.-]+)\/([\w.-]+)\/(pull|issues|releases\/tag)\/([^\s#)"'<>]+)(?:#issuecomment-(\d+))?/g;

function collectStrings(value, out = []) {
	if (typeof value === "string") out.push(value);
	else if (Array.isArray(value))
		for (const item of value) collectStrings(item, out);
	else if (value && typeof value === "object")
		for (const item of Object.values(value)) collectStrings(item, out);
	return out;
}

// Turns every GitHub object URL in the command output into an API target.
function targets(text) {
	const seen = new Set();
	const list = [];
	for (const m of text.matchAll(OBJECT_URL)) {
		const [, host, owner, repo, kind, ref, comment] = m;
		const base = `repos/${owner}/${repo}`;
		let target;
		if (comment) {
			const api = `${base}/issues/comments/${comment}`;
			target = {
				label: `comment ${comment}`,
				get: api,
				patch: () => api,
				fields: ["body"],
			};
		} else if (kind === "pull") {
			target = {
				label: `PR #${ref}`,
				get: `${base}/pulls/${ref}`,
				patch: () => `${base}/pulls/${ref}`,
				fields: ["title", "body"],
			};
		} else if (kind === "issues") {
			target = {
				label: `issue #${ref}`,
				get: `${base}/issues/${ref}`,
				patch: () => `${base}/issues/${ref}`,
				fields: ["title", "body"],
			};
		} else {
			target = {
				label: `release ${ref}`,
				get: `${base}/releases/tags/${ref}`,
				patch: (o) => `${base}/releases/${o.id}`,
				fields: ["name", "body"],
			};
		}
		target.host = host;
		if (!seen.has(target.get)) {
			seen.add(target.get);
			list.push(target);
		}
	}
	return list;
}

function gh(args, host, input) {
	const full = host === "github.com" ? args : [...args, "--hostname", host];
	return execFileSync("gh", full, {
		encoding: "utf8",
		input,
		stdio: ["pipe", "pipe", "ignore"],
	});
}

// Re-reads objects the gh command just created or edited and patches attribution away. Returns report lines.
function fixGithubObjects(command, toolResponse, opts) {
	if (!GH_CMD.test(maskHeredocBodies(command))) return [];
	const reports = [];
	for (const target of targets(collectStrings(toolResponse).join("\n"))) {
		let current;
		try {
			current = JSON.parse(gh(["api", target.get], target.host));
		} catch (error) {
			debug(`gh api ${target.get} failed: ${error.message}`);
			reports.push(
				`could not verify ${target.label} on GitHub after the fact (gh api failed); check it for attribution manually.`,
			);
			continue;
		}
		const patch = {};
		for (const field of target.fields) {
			if (typeof current[field] !== "string") continue;
			const next = scrubMessage(current[field], opts);
			if (next !== current[field]) patch[field] = next;
		}
		const fields = Object.keys(patch);
		if (fields.length === 0) continue;
		try {
			gh(
				["api", "-X", "PATCH", target.patch(current), "--input", "-"],
				target.host,
				JSON.stringify(patch),
			);
			reports.push(
				`edited ${target.label} on GitHub to remove AI attribution (${fields.join(", ")}). GitHub keeps the previous text in the edit history.`,
			);
		} catch (error) {
			debug(`gh api PATCH ${target.label} failed: ${error.message}`);
			reports.push(
				`${target.label} on GitHub still carries AI attribution and the edit failed; fix it manually.`,
			);
		}
	}
	return reports;
}

module.exports = { fixGithubObjects };
