# Changelog

## 0.1.3 - 2026-09-24

- Subject lines with a component prefix such as `ai-gateway:` or `claude-client:` are kept. Only the trailer keys tools use (`Claude-Session`, `AI-Assisted`, `X-AI-*`) are stripped.
- Trailers of people at AI companies are kept. A tool name now has to appear in the display name, or the address has to be Anthropic's noreply, for a trailer to go.
- Feature descriptions such as "Built with the OpenAI SDK" or "Powered by Gemini" are kept. Only authorship verbs (generated, created, written, drafted, assisted, co-authored) with the tool named nearby count as a footer.
- A command that only mentions git inside a heredoc body, such as writing a notes file, is left untouched.
- Message files that are not valid UTF-8 are skipped instead of rewritten.
- Tests remove their temporary directories.

## 0.1.2 - 2026-09-24

- Trailers that credit a person named Claude, Jules, Devin or Kiro are kept. Only tool identities are stripped (Anthropic addresses, "Claude Code", model names, Copilot, the Jules and Devin bots, Cursor and friends), and names must match whole words, so "Precursor" no longer counts as Cursor.
- `git -C dir commit` and `git -c key=value commit` now reach the post-commit check.
- `-F` is only read as a message file for commit, tag, merge, notes, am, revert and cherry-pick, and for gh and glab pr, mr, issue and release commands. `git grep -F` and `gh api -F` are left alone.
- Text inside heredoc bodies no longer steers command parsing: a `cd` or `git commit` line inside a `cat <<EOF` block does not change which directory or command the hooks act on.
- `cd -P dir` and `cd -L dir` are followed like a plain `cd`.

## 0.1.1 - 2026-09-24

- Hooks now follow cd steps that precede a git or gh command when resolving message files and the commit to inspect. Commands run from a parent directory, such as `cd repo && git commit -F msg.txt`, were missed before.
- Emoji, dash and ellipsis replacement outside heredocs now only touches lines that invoke git, gh or glab. Other lines of a compound command are left alone.

## 0.1.0 - 2026-09-24

Initial release.

- Session rules that stop Claude adding attribution, emoji and typographic punctuation to anything bound for git or GitHub.
- PreToolUse rewrite of git, gh and glab commands, of message files passed with -F, --file, --body-file or --notes-file, and of GitHub MCP text fields.
- PostToolUse safety net: amends fresh unpushed commits and edits GitHub pull requests, issues, comments and releases that still carry attribution.
- NO_TRACE_STYLE, NO_TRACE_AMEND and NO_TRACE_DEBUG switches.
