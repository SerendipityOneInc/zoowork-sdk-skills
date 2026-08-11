# ZooClaw Skills

Skills that teach AI coding assistants how to build on [ZooClaw Managed Agents](https://github.com/SerendipityOneInc/zoowork-agents-docs).

Install one of these into Claude Code, Cursor, or any other assistant that reads
[Agent Skills](https://github.com/anthropics/skills), and it will know the shape of the API before
it writes the first line: which calls exist, which do not, and the handful of places where code that
looks right fails at runtime.

## Install

```bash
npx skills add SerendipityOneInc/zoowork-sdk-skills
```

That is the whole thing. The [`skills` CLI](https://www.skills.sh/) installs into whichever
assistants you have - Claude Code, Codex, Cursor, OpenCode and 70-odd others - each in the
directory it actually reads. It needs **Node 22.20 or later**.

Useful flags: `-g` installs for every project instead of the current one, `-a claude-code`
targets one assistant, `--copy` copies instead of symlinking (a symlink means upstream
updates reach you without reinstalling).

Using Claude Code and nothing else? The plugin route does the same job:

```bash
/plugin marketplace add SerendipityOneInc/zoowork-sdk-skills
/plugin install zooclaw-agents@zooclaw-skills
```

Install it wherever you are building, not only where you are reading. The skill is about the
platform, so it earns its keep in *your* project.

## What is here

| Skill | What it gives an assistant |
|---|---|
| [`zooclaw-managed-agents`](skills/zooclaw-managed-agents/SKILL.md) | How to create and configure agents, run sessions, consume the event stream, upload and attach skills, schedule autonomous runs - and which capabilities are absent, with the real alternative for each |

`zooclaw-managed-agents` covers the TypeScript SDK, `@zooclaw-agents/sdk`. There is no Python SDK
yet; the skill says so rather than letting an assistant invent an import.

## Two things called "skill"

Worth separating before it causes confusion, because both words appear in the same conversation:

- **The skills in this repo** are installed into a *developer's coding assistant*, and are read while
  writing code.
- **ZooClaw platform skills** are uploaded with `POST /v1/skills` and attached to a *running ZooClaw
  agent*, which reads them while doing its job.

The skill here teaches an assistant how to build and upload the other kind. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full distinction.

## Layout

```
skills/<name>/SKILL.md     the skill itself: frontmatter + instructions, loaded whenever it triggers
skills/<name>/references/  depth, read on demand when SKILL.md points at it
evals/                     task prompts and assertions used to check a skill still works
```

## Changing a skill

A skill body is a prompt, and prompt edits do not behave like code edits - they can improve one task
while quietly breaking another. `evals/` exists for that: it holds realistic task prompts and
machine-checkable assertions about the code an assistant produces. Run them before and after a
substantive change and compare. See [evals/README.md](evals/README.md).

Contribution conventions, including the English-only rule and what gets checked in review, are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
