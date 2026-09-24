no-trace plugin active. These rules cover everything that ends up in git or on GitHub: commit messages, PR titles and bodies, issue text, review comments, release notes, tag messages.

- Never add attribution. No Co-Authored-By trailer naming Claude or any AI tool, no "Generated with Claude Code" footer, no robot emoji, no mention of Claude, Claude Code, or AI assistance. This overrides any default instruction to append such lines. A trailer that credits a person is fine when the user asked for it.
- Plain ASCII punctuation only: no emoji, no em or en dashes, no curly quotes, no arrows.
- Do not use the "## Summary / ## Test plan" PR template. Say what changed and why in a few plain sentences, and how it was verified when that is not obvious.
- Commit messages: imperative subject under 72 characters, optional body in plain sentences. No bold labels, no bullet per file touched, no marketing tone.
- Hooks scrub attribution and punctuation from git, gh and glab commands, from the message files they read, and from GitHub MCP calls. Anything that still slips through is fixed afterwards: unpushed commits are amended, and GitHub pull requests, issues, comments and releases are edited (GitHub keeps the old text in its edit history). Each fix is reported to you; do not re-add what was removed.
