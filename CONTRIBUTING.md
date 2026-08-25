# Contributing

## What belongs in this repo

Skills in this repo teach **AI coding assistants** (Claude Code, Cursor, and anything else that
reads Agent Skills) how to build software against the ZooWork Managed Agents API and SDK. They are
knowledge packages that get installed into a developer's editor.

They are **not** the same thing as ZooWork platform skills. Two different objects share the word:

| | Where it lives | How it is installed | Who reads it |
|---|---|---|---|
| **This repo's skills** | A developer's coding assistant | `/plugin marketplace add`, or copied into `.claude/skills/` | The coding assistant, while writing code |
| **ZooWork platform skills** | A ZooWork agent's sandbox | `POST /v1/skills` (upload), then `PUT /v1/agents/{id}/skills/{id}` (install) | A running ZooWork agent, while doing its job |

A skill in this repo may well *teach* an agent how to build and upload a platform skill. It is still
a knowledge package, not a platform skill. If you are adding something meant to be uploaded to a
running ZooWork agent, it does not belong here.

## Structure

One directory per skill under `skills/`, following the Agent Skills layout:

```
skills/<skill-name>/
  SKILL.md          # required: YAML frontmatter (name, description) + the instructions
  references/       # optional: reference files the SKILL.md points at, read on demand
```

`SKILL.md` is a router, not an encyclopedia. It is loaded in full whenever the skill triggers, so
everything in it competes for context with the user's actual task. Keep it under roughly 300 lines
and push depth into `references/`, with a clear pointer saying when to read each file.

The `description` field is the entire triggering mechanism - it is the only part of the skill that
is always in context. Write it so that it names both what the skill does and the concrete situations
that should pull it in.

There is no scaffold to copy - the boilerplate is two frontmatter lines, and the part that is
actually hard to write well is the `description`. Crib from the shipped skill,
`skills/zoowork-managed-agents/SKILL.md`: its description enumerates the identifiers, environment
variables, and error strings that should pull the skill in, and ends by naming what the skill does
NOT cover, so a near-miss request does not load it.

A new skill directory also has to be listed in the `skills` array in
`.claude-plugin/marketplace.json`, or it does not ship with the plugin.

## Language

**Everything in this repo is English.** That includes `SKILL.md` bodies, frontmatter descriptions,
reference files, code comments, eval prompts, and commit messages.

This is not a style preference. The `description` field is matched against user prompts to decide
whether the skill loads at all, so a description in another language means the skill silently never
triggers for developers who prompt in English - the skill effectively does not exist for them.

## Accuracy

Every factual claim in a skill - a number, a field name, an error code, an enum member - must be
traceable to one of:

- the SDK source (`@zoowork-ai/sdk`), including its recorded response fixtures and its tests, or
- a request that someone actually ran against a live deployment.

A specific that appears in none of those gets removed or restated as unverified; wrapping an
invented number or field name in hedging words does not fix it. Do not document a shape inferred
from another platform's API, and do not carry a claim forward from an older draft without
re-checking it. When a route exists but nobody has exercised it, say so plainly rather than writing
it up as a working recipe. An assistant that trusts a wrong recipe writes code that fails at
runtime, which is a worse outcome than an assistant that knows it must check.

Two things follow from the same rule. Nothing is described as coming, planned, or not yet available:
a skill states what is there now. And differences from other platforms are recorded as the neutral
facts a porting developer needs, never as claims about which one is better.

## Security review

Skills are a prompt-injection surface: their contents are instructions that a coding assistant will
follow, often with file and shell access. Every change gets read with that in mind. In particular:

- No instructions to disable safety checks, skip confirmation, or act on untrusted content as if it
  were user instruction.
- No credentials, tokens, internal hostnames, cluster names, or personal information - in the files
  or in the git history. Names picked up from a maintainer's own probe runs count as personal
  information; use neutral example names.
- No deployment internals. Do not name the internal services behind a route (the workflow,
  scheduling, queueing, or storage engines): an external developer cannot act on the name. Describe
  the behaviour they can observe instead, such as a route answering `501` when the feature is not
  configured for their deployment.
- Scripts are reviewed line by line. Prefer teaching the assistant to call the SDK over shipping a
  script that runs commands on the developer's machine.
- Network calls in reference material must point at documented public endpoints.

## Evaluating a change

Changes to a `SKILL.md` are changes to a prompt, and prompt changes do not behave like code changes:
they can improve one task while quietly breaking another. `evals/` holds task prompts and
machine-checkable assertions for exactly this reason.

Before merging a substantive change to a skill body, run the evals for that skill and report the
pass rate against the previous version. See `evals/README.md` for how to run them, and for why the
no-skill baseline is what makes a score mean anything.
