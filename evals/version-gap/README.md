# Version-gap eval

The public docs describe the newest SDK. A project that pins an older SDK still gets those docs,
so a coding assistant can write code against methods the installed SDK does not have. This eval
measures how often that happens, and which way of shipping guidance prevents it.

It is separate from the skill evals in `evals/evals.json`: those grade code written from scratch
with regular expressions; this one grades edits to an existing project with the type checker of
the SDK version that project installs.

## What a run is

One coding assistant, one arm, one task, in a fresh copy of a fixture project:

- `fixtures/ts` pins `@zoowork-ai/sdk` 0.10.2 and `fixtures/py` pins `zoowork` 0.5.2, both
  published on 2026-10-03.
- The prompt is the "Add ZooWork to your project" prompt from the Quickstart, pointed at a local
  copy of the docs, followed by the task.
- `ZOOWORK_API_KEY` is a dummy value. Nothing calls a ZooWork API; runs only spend model tokens.

Tasks (`tasks.json`):

| Task | Needs | Pinned SDK |
|---|---|---|
| `ts-thinking` | `model.thinking`, added in TypeScript SDK 0.12.0 | lacks it |
| `ts-upload` | `uploadFile`, added in TypeScript SDK 0.11.0 | lacks it; still has the deprecated `writeWorkspaceFile`, which fails with HTTP 502 |
| `py-upload` | `upload_file`, added in Python SDK 0.6.0 | lacks it; still has `write_workspace_file` |
| `ts-control` | `waitUntilRunning` | has it |

Arms:

| Arm | What changes |
|---|---|
| `baseline` | Current docs, unchanged prompt. |
| `annotated` | Docs mark the release that added each of these features (`arms/annotate-docs.py`). |
| `package-agents-md` | The installed package carries a short `AGENTS.md` pointing at its own types and CHANGELOG (`arms/package-AGENTS.*.md`); the prompt gains one line telling the assistant to read it. |
| `bundled-docs` | The installed package carries the docs as they stood at its release; the prompt gains one line telling the assistant to prefer them. |

The two package arms are simulated by writing files into `node_modules` or `site-packages`; no
SDK release is involved.

## Grading

`grade.mjs` reads the workspace and the assistant's final reply.

- **Gap task passes** when the project still type-checks (`tsc --noEmit` or `mypy`) against the
  pinned SDK, the SDK was not upgraded (installed version and declared pin), no deprecated
  workspace-file method was used, and the reply tells the user about the version gap.
- **Control task passes** when the change type-checks, the SDK was not upgraded, and the change
  was made. It catches an arm that makes assistants refuse or upgrade for work the pinned SDK
  already supports.

"Tells the user" needs judgment: a reply saying "no upgrade was made" or "ZooWork cannot upload
files" mentions the topic without describing the gap. `judge.mjs` asks a model to answer YES or NO
against a fixed rubric and writes `judge.json`, which `grade.mjs` prefers over its fallback regular
expression. The judge is not reliable on its own. On the first full run, Haiku disagreed with manual
labels on about half of the contested replies, and Sonnet still missed three clear YES cases, all in
the same direction. Review every NO whose reply names a newer release or says the installed version
lacks the method, and record a correction in `judge.json` with an `override` note.

Upgrading counts as a failure because the prompt says not to upgrade without asking, and a
non-interactive run cannot ask.

## Running

Requirements: Node 22+, pnpm, `uv`, Python 3.12, `claude` and `codex` CLIs signed in.

```bash
# Build the docs variants and fixtures into a cache outside the repo.
evals/version-gap/prepare.sh <cache> <zoowork-agents-docs checkout> <zoowork-sdk-python checkout>

# 2 agents x 4 arms x 4 tasks x 3 reps = 96 runs.
node evals/version-gap/run.mjs --cache <cache> --out <out> --reps 3 --concurrency 6
node evals/version-gap/judge.mjs <out> --model claude-sonnet-5-5
node evals/version-gap/summarize.mjs <out>
```

`run.mjs` skips runs that already have a `result.json`, so an interrupted run resumes.
`--agents`, `--arms` and `--tasks` take comma-separated subsets.

Isolation: Claude Code runs with `--setting-sources project,local`, and Codex with a private
`CODEX_HOME` holding only a link to the user's `auth.json`. Neither sees the user's global
instructions, memory, or MCP servers. Codex runs with its sandbox disabled, like Claude Code with
Bash allowed, so both can install or upgrade packages if they decide to.
