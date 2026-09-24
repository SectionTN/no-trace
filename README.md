# no-trace

[![release](https://img.shields.io/github/v/release/SectionTN/no-trace?display_name=release&label=release)](https://github.com/SectionTN/no-trace/releases)
[![ci](https://github.com/SectionTN/no-trace/actions/workflows/ci.yml/badge.svg)](https://github.com/SectionTN/no-trace/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/SectionTN/no-trace)](LICENSE)

Claude Code plugin that keeps AI fingerprints out of your git history and GitHub activity.

Claude Code appends `Co-Authored-By: Claude <noreply@anthropic.com>` to commits and a
"Generated with Claude Code" footer to pull requests. This plugin removes both, along with
the punctuation habits that give generated text away, from every `git`, `gh` and `glab`
command and every GitHub MCP call the assistant makes.

## Why a hook and not a rule

Telling Claude in `CLAUDE.md` or a rules file not to add attribution works until it does
not. A long session or a compaction later, the rule has slipped out of context, the trailer
lands in the commit, you point it out, and you get "You're absolutely right!" plus a commit
to amend. A hook does not forget. It runs on every command whether or not the rule survived,
and it fixes the ones that got through.

Claude Code's `attribution` setting can blank its own commit trailer and pull request
footer, and that part is reliable. no-trace is for the rest: trailers from Copilot, Cursor,
Codex, Jules or Devin when more than one assistant touches a repo, the emoji, em dashes and
curly quotes that mark generated prose, message files and GitHub MCP calls the setting never
sees, and a repair step for whatever still lands in a commit or a pull request. It also
holds on a new machine or project where neither the rule nor the setting made it over.

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
