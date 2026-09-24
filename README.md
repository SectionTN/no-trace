# no-trace

Claude Code plugin that keeps AI fingerprints out of your git history and GitHub activity.

Claude Code appends `Co-Authored-By: Claude <noreply@anthropic.com>` to commits and a
"Generated with Claude Code" footer to pull requests. This plugin removes both, along with
the punctuation habits that give generated text away, from every `git`, `gh` and `glab`
command and every GitHub MCP call the assistant makes.

## How it works

Three hooks run, in this order.

At session start the plugin tells Claude not to add attribution, emoji, em dashes, curly
quotes or the "Summary / Test plan" PR template in the first place.

Before a `git`, `gh` or `glab` command runs, a PreToolUse hook rewrites it. The hook
removes trailers such as `Co-Authored-By`, `Signed-off-by` or `Claude-Session` when they
name an AI tool (trailers that name a person stay) and any "Generated with" footer. It
drops emoji, turns em and en dashes into hyphens, turns ellipsis characters into three
dots and, inside heredocs, straightens curly quotes and arrows. It also cleans message
files passed with `-F`, `--file`, `--body-file` or `--notes-file` on disk before git or gh
reads them. The same cleanup applies to the `body`, `title`, `message` and similar fields
of GitHub MCP tool calls.

After the command ran, a PostToolUse hook re-reads what it produced. If a commit message
still carries attribution, the hook amends the commit, provided it is less than two
minutes old and not on any remote. If a pull request, issue, comment or release still
carries attribution, the hook edits it through `gh api`. GitHub keeps the previous text in
the object's edit history, so this last step limits the damage rather than erasing it, and
the hook says so in its report.

Every fix comes back to Claude as hook context, so it knows what changed and does not
add it again.

## Install

    claude plugin marketplace add SectionTN/no-trace
    claude plugin install no-trace@no-trace

You need Claude Code 2.1.83 or newer, because the hooks use `if` filters to spawn only
for git and gh commands, and Node.js 18 or newer on PATH. The hooks have no dependencies.

## Options

Set these in your shell or in the `env` block of `~/.claude/settings.json`.

| Variable | Effect |
|---|---|
| `NO_TRACE_STYLE=0` | Keep emoji, dashes and quotes. The hooks only remove attribution. |
| `NO_TRACE_AMEND=0` | Never amend commits. The hook only reports what it found. |
| `NO_TRACE_DEBUG=1` | Log what the hooks do to stderr, visible with `claude --debug`. |

## Development

    npm test
    npm run lint
    claude plugin validate .

Load a working copy for one session with `claude --plugin-dir /path/to/no-trace`.
To release, bump `version` in `.claude-plugin/plugin.json`, add a changelog entry and
run `claude plugin tag`.
