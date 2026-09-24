# Changelog

## 0.1.0 - 2026-09-24

Initial release.

- Session rules that stop Claude adding attribution, emoji and typographic punctuation to anything bound for git or GitHub.
- PreToolUse rewrite of git, gh and glab commands, of message files passed with -F, --file, --body-file or --notes-file, and of GitHub MCP text fields.
- PostToolUse safety net: amends fresh unpushed commits and edits GitHub pull requests, issues, comments and releases that still carry attribution.
- NO_TRACE_STYLE, NO_TRACE_AMEND and NO_TRACE_DEBUG switches.
