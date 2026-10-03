---
name: zoowork-managed-agents
description: Build on ZooWork Managed Agents through the `@zoowork-ai/sdk` TypeScript SDK or `zoowork` Python SDK. Use whenever ZooWork, the ZooWork App Kit, a `zwp_live_`, `agt_`, or `skl_` identifier, `ZOOWORK_API_KEY`, a ZooWork Agent or Session, streaming events, custom tools, MCP, platform Skills, Environments, channels, schedules, approvals, or ZooWork API errors are mentioned. Inspect the installed SDK version and read the routed reference before writing ZooWork code.
license: MIT
---

# Building on ZooWork Managed Agents

Start with the user's task, then read only the reference that owns it. The public API is a
Developer Preview, so inspect the installed SDK before relying on a remembered signature.

## Four invariants

These are the most common reasons code compiles but fails at runtime:

1. `createAgent` creates a stopped Agent. Call `startAgent(id)` and wait for `desired_state` before
   opening a Session.
2. Every Session method takes `agentId` first.
3. Assistant text comes from `agent.assistant` through `assistantText()` / `assistant_text()`.
4. A Session stream does not close at turn end. Break on `run.finished` through
   `isRunFinished()` / `is_run_finished()`.

## Preflight

Before writing code:

1. Read `package.json`, `pyproject.toml`, lockfiles, and existing imports.
2. Determine whether the project uses `@zoowork-ai/sdk` or `zoowork`, and record its installed
   version. Do not upgrade it unless the user asks.
3. Check whether `ZOOWORK_API_KEY` and `ZOOWORK_BASE_URL` are present without printing their values.
4. Reuse the project's existing client and configuration style.
5. Read the routed reference below. For an exact method or type, verify the installed declarations
   or Python source as the final authority.

If no project is present, state which package and runtime the example assumes. TypeScript requires
Node.js 20+; Python requires Python 3.10+; the App Kit requires Node.js 22+.

## Route by task

| User intent | Read before acting |
|---|---|
| TypeScript method, option, return shape, Agent config, model, MCP, permission, Environment, channel, schedule, approval, artifact, `exec`, or `wake` | `references/typescript-sdk.md` |
| Python import, snake_case method, return shape, event helper, custom tool, Session cursor, Agent config, MCP, or channel | `references/python-sdk.md` |
| Files, read-only Database inspection, Usage, webhook registration/verification/delivery diagnostics, Run Output, or action paging/detail | `references/developer-api.md` |
| Stream replies, reconnect, render events or tool calls, read/export history, or write Session events | `references/events-and-streaming.md` |
| Host an Agent built locally, select its Skills, deploy one Agent per user, or keep one Skill synchronized across a fleet | `references/deploy-your-agent.md` — follow it in order |
| Credentials, binary file attachment, repository mount, worker queues, cross-Agent Session listing, rollback, or another uncertain capability | `references/not-supported.md` — check before designing |

Read more than one reference only when the request genuinely crosses those boundaries. For example,
a basic streaming chat needs the language reference plus events; it does not need the deployment or
capability-boundary documents.

## Choose the path

| The user has | Give them |
|---|---|
| No API key or no running Agent | The setup flow below |
| A key and wants a working Agent chat UI | ZooWork App Kit |
| Their own backend, UI, or Agent design | The official SDK |
| A local persona and Skills that need hosted execution | `references/deploy-your-agent.md` |

The App Kit is the `app-kit/` template in
<https://github.com/SerendipityOneInc/zoowork-quickstarts>. Read its current README before changing
it; do not reconstruct its setup from memory.

## API key onboarding

Create a Project API key at <https://platform.zoowork.ai>. Agent and Session access is scoped
to the selected Project. The secret is shown once; have the user save it in `ZOOWORK_API_KEY`
themselves. Keep it on their backend, outside browser/mobile code, logs and chat.

Initialize Organization billing and bind owner credentials. If the API requests rebinding,
sign in to Platform and rebind the key. `listModels()` / `list_models()` is a cheap read-only
credential check; it does not prove runtime readiness or authorize a billable test.

## Minimal lifecycle

Use this order:

1. List models and select a row whose `selectable` value is not `false`.
2. Create the Agent once with a stable idempotency key.
3. Persist `agent_id`.
4. Start the Agent and wait for `desired_state` with the SDK helper.
5. Create one Session per conversation.
6. Post later turns into the same Session and resume streaming from the last processed cursor.

Do not create an Agent inside the function that answers every user message. Each Agent owns a
persistent workspace and sandbox.

```ts
import {
  assistantText,
  createZooworkClient,
  isRunFinished,
  runOutcome,
} from '@zoowork-ai/sdk'

const zc = createZooworkClient()
const models = await zc.listModels()
const model = models.find((row) => row.selectable !== false)?.model
if (!model) throw new Error('No selectable ZooWork model')

const created = await zc.createAgent(
  { resource: { name: 'support-agent', model: { primary: model } } },
  'support-agent-v1',
)
const agentId = created.agent_id
await zc.startAgent(agentId)
await zc.waitUntilRunning(agentId)

const session = await zc.createSession(agentId, {
  initial_events: [{ type: 'user.message', content: 'Hello' }],
})

let cursor: string | undefined
for await (const event of zc.streamEvents(agentId, session.session_id)) {
  cursor = event.cursor ?? cursor
  process.stdout.write(assistantText(event))
  if (isRunFinished(event)) {
    if (runOutcome(event) !== 'succeeded') throw new Error(`run ${runOutcome(event)}`)
    break
  }
}
```

For Python, use the same lifecycle with `create_zoowork_client`, `list_models`, `create_agent`,
`start_agent`, `wait_until_running`, `create_session`, `stream_events`, `assistant_text`, and
`is_run_finished`. Read `references/python-sdk.md` before writing the exact call shapes; nested
payloads retain public wire spelling where documented.

## Session and event rules

- The event log contains user inputs, assistant replies, tool activity, and run completion.
- Resume with each event's opaque `cursor`; do not derive it from `seq`.
- Checkpoint only after processing the event. Cursor resume does not make application side effects
  exactly-once.
- `listEvents()` returns one page and drops pagination metadata. Use `listAllEvents()` for the full
  history or `listEventsPage()` for explicit cursor pagination.
- `toolCall().phase` is `start`, `end`, or `blocked`. A blocked call has not run.
- A failed tool call does not necessarily fail the run. `runOutcome()` is the authority.
- Retried writes should use a stable `idempotency_key`.
- A valid `user.interrupt` with no active run can return `accepted: false`; that is a normal no-op.
- `actor: { ref }` selects memory attribution. It is not authentication, authorization, or sandbox
  isolation; derive it from authenticated backend state.

Application-executed custom tools pause the current run until the user's backend resolves them.
They are not MCP tools and not a worker-registration API. Read both the language reference and the
events reference before implementing recovery.

## Platform Skills

A ZooWork platform Skill is attached to a running Agent. It is different from this coding-agent
skill, which teaches a developer's assistant how to call ZooWork.

- New Agents receive global Skills by default. Set `include_global_skills: false` or an explicit
  empty Skill list to opt out.
- Create bindings accept catalog `name` or `skill_id`; inspect `listAgentSkills` / `list_agent_skills`
  to see the resolved assignment.
- Project keys cannot manage the root Skill registry, root Environments, or Channels. An SDK
  method's existence does not grant those capabilities.
- Use `persona.docs` for your own instructions and the Files helpers for workspace task inputs.
  Writing a file is not a registered Skill upload. Do not promise a ZIP registry workflow.
- Prove runtime behavior with an authorized real turn; attachment state alone does not prove use.

Follow `references/deploy-your-agent.md` for packaging, versioning, attachment verification,
per-user isolation, scheduling, UI wiring, and teardown.

## Capability and evidence boundary

“The SDK has no helper” and “the platform has no public contract” are different claims. Before
saying a feature is absent, inspect the installed SDK, public docs, `references/developer-api.md`, and `references/not-supported.md`.

Use these evidence labels:

- **Live-verified:** exercised against a named deployment.
- **Source-reviewed:** confirmed in public SDK source or declarations.
- **Offline-tested:** covered by fixtures or unit tests without a live tenant.
- **Unknown:** evidence is insufficient; do not invent a method or route.

Do not run live, billable, or tenant-mutating calls merely to answer a design question.

## Common pitfalls

- Wait on `desired_state`, never `actual_state`; the latter is a chat-channel health projection.
- Platform uses a managed Environment. Project keys do not administer root Environments.
- `createAgent` and `getAgent` return different shapes.
- `updateAgent` accepts `expected_config_version` for atomic optimistic concurrency; stale
  writes return `409 active_config_changed`. A version is not an idempotency receipt or rollback handle.
- MCP exposure, runtime context, and permission policy are separate controls.
- Tool-policy wildcards allow an exact name, global `*`, or one trailing `prefix*` only.
- There is no public credential store for an end user's secret.
- Match `ZooworkError.status` and `.type`, not message text.
- A cross-tenant or unknown identifier can return 404 rather than 403.
- `exec(agentId, args)` takes argv. A non-zero process exit can still be HTTP 200.
- Deleting an Agent does not delete its schedules. Remove schedules before deleting a throwaway
  Agent.
- Do not mix TypeScript camelCase with Python snake_case. Treat identifiers, cursors, and unknown
  response fields as opaque.

Public developer documentation is at
<https://github.com/SerendipityOneInc/zoowork-agents-docs>.
