---
name: zoowork-managed-agents
description: Build on ZooWork Managed Agents - hosted AI agents that run in a managed sandbox, driven from your own code through the `@zoowork-ai/sdk` TypeScript SDK. Use this skill whenever ZooWork is mentioned; on any `zct_` key, `agt_` or `skl_` id, `ZOOWORK_API_KEY`, `ZOOWORK_BASE_URL`, `@zoowork-ai/sdk`, `createZooworkClient`, `waitUntilRunning`, `putAgentSkill`, `startFeishuSetup`, binding a Feishu/Lark channel to an agent, or the ZooWork App Kit; on the errors `agent_not_running`, `environment_locked`, `session_archived`, `exec_requires_agent_scope`, or `environment_not_ready`; and when someone wants a ZooWork agent they built locally, with its skills, hosted somewhere it can serve real users. Read it before writing any ZooWork call - code that merely looks right here compiles and then fails at runtime.
license: MIT
---

# Building on ZooWork Managed Agents

**The four that break code which compiles. If you read nothing else here, read these.**

1. `createAgent` leaves the agent **stopped**. Call `startAgent(id)` then `waitUntilRunning(id)`, or
   every session call answers `409 agent_not_running`.
2. Every session method takes **`agentId` first**: `createSession(agentId, ...)`,
   `postEvents(agentId, sessionId, ...)`, `streamEvents(agentId, sessionId, ...)`.
3. Reply text comes from `agent.assistant` via **`assistantText(ev)`** - never from `chat.delta`,
   which is snapshot-replace and never reaches you anyway.
4. The stream **does not close at turn end**. `break` on `isRunFinished(ev)` or you block until the
   server's idle timeout.

ZooWork hosts the agent loop and the sandbox its tools run in. You create an agent (a persistent,
versioned configuration), start it, then open sessions against it and read a durable event stream.
Your code owns the product; the platform owns the loop, the container, and the transcript. The API
is a Developer Preview: shapes can change within a version, and the reference files mark which
surfaces have been exercised against a live deployment and which have not.

Decide two things before writing code: **which path** the user is on (below), and **whether what
they want actually exists here** (`references/not-supported.md` - check it before designing, not
after the first integration test).

## Before you start

**The package is `@zoowork-ai/sdk`.** Not `@zoowork/sdk`, not `@zoowork-agents/sdk`. Those names
have never existed on npm, and guessing one sends the user to a 404.

**The key.** One credential authenticates everything: an organization service token that starts with
`zct_`, passed as `apiKey`. It authenticates the whole organization with full read and write over
every agent in it, so it belongs on a server the user controls and never in a browser bundle, a
mobile app, or a build-time inlined variable.

```bash
export ZOOWORK_API_KEY='zct_...'
```

**No key yet? Walk the user through getting one.** Keys are self-served in the ZooWork App:

1. First check what they have: is `ZOOWORK_API_KEY` set? If a key exists, `listModels()` is the
   cheapest proof it works - it touches no agent and creates nothing. A `401` with
   `service_token.invalid` means the key is wrong or revoked, not that the route moved - treat it
   the same as no key and continue here.
2. If there is no key, send them to
   **<https://zoowork.ai/claw-settings?tab=account-api-keys>**
   (in the App: **Settings → API Keys → Create API Key**). Tell them to name it after where it
   will live (`staging-backend`, not `test`), and to copy the secret immediately - **it is shown
   exactly once** and cannot be retrieved again. Have them put it in `ZOOWORK_API_KEY` (or their
   `.env`) themselves and say when it's saved - **the key should not be pasted into the chat**.
3. Who can do this: on a personal organization, anyone; on an enterprise organization the tab
   requires the **admin** role. If they cannot see the tab, the next step is asking their org
   admin for a key, not hunting for another endpoint - there is none, and key management has no
   API on purpose.
4. Once they say the key is saved, re-run the `listModels()` check before writing any other
   code. If it still fails, send them back to the same page - do not start debugging the SDK.

A leaked or lost key is handled on the same App page: **Rotate** kills the old secret immediately
and shows a new one once. Never echo the key back in code, logs, or chat.

## Which path

| The user has | Give them | Why |
|---|---|---|
| A key, and wants a working agent UI today | **ZooWork App Kit** - clone, paste the key, three commands | A deployable chat app with auth, persistence, streaming, and reconnect already solved |
| Their own front end, or an agent design of their own | **The SDK, directly** | Full control; you write the integration around sessions and events |
| An agent they built locally that has nowhere to run | **The SDK** - see `references/deploy-your-agent.md` | Their persona and skills become a hosted agent; their UI keeps talking to their own backend |

### The App Kit path

The App Kit is the `app-kit/` template inside
`https://github.com/SerendipityOneInc/zoowork-quickstarts`, a Cloudflare Workers chat application
that already consumes this SDK. It provisions an agent on first use, so the user needs no `agt_` id.

```bash
cd app-kit                        # the kit is one template in that repo, not its root
cp .dev.vars.example .dev.vars    # paste the zct_ key into ZOOWORK_API_KEY
pnpm install
pnpm db:migrate:local
pnpm dev                          # UI on http://127.0.0.1:4000
```

Node 22 or later (the App Kit's floor; the SDK itself needs only Node 20). `ZOOWORK_API_KEY` is the
only value to fill in. Before shipping it to real users, two things must change: set
`AGENT_PICKER=off`, and put Cloudflare Access in front of the Worker
(`CF_ACCESS_TEAM_DOMAIN` + `CF_ACCESS_AUD`) instead of the local `DEV_EMAIL` shortcut, which trusts
whoever connects. When someone asks to customize the App Kit rather than call the API, read its
README first - the answer is usually a file it already has.

---

## The mandatory flow

| Step | Call | Frequency |
|---|---|---|
| 1 | `createAgent(...)` then `startAgent(id)` | **Once.** At setup, or in a provisioning path guarded by an idempotency key. Store the `agent_id` |
| 2 | `createSession(agentId, ...)` | **Every conversation.** |
| 3 | `postEvents(...)` / `streamEvents(...)` | **Every turn.** |

An agent is a stored object, not a per-request construct. If you are about to write `createAgent()`
in the same function that answers a user message - stop. Creating one per request makes a new agent,
with its own workspace and sandbox, on every call. It belongs in setup, and the id belongs in the
user's database.

```ts
import {
  createZooworkClient,
  assistantText,
  isRunFinished,
  runOutcome,
} from '@zoowork-ai/sdk'

// Reads ZOOWORK_API_KEY. Throws at construction if no key resolves, rather than 401-ing later.
const zc = createZooworkClient()

// 1. Ask which models this deployment carries. A recalled id is a 400, not a fallback.
const models = await zc.listModels()
const model = models.find((m) => m.model.includes('sonnet'))?.model ?? models[0]?.model
if (!model) throw new Error('no models available to this key')

// 2. Create. Ownership comes from your API key - the SDK handles it, nothing to pass.
const created = await zc.createAgent(
  {
    resource: {
      name: 'support-agent',
      model: { primary: model },
      // persona.docs is an ARRAY of documents, not a filename-keyed object.
      persona: { docs: [{ name: 'AGENTS.md', content: 'You answer questions about our billing policy.' }] },
    },
  },
  // A stable idempotency key, not a per-run uuid. Two agents means two sandboxes and two
  // workspaces, and nothing in the product cleans the spare one up.
  'support-agent-v1',
)
const agentId = created.agent_id // agt_... - persist this, it is the handle for everything below

// 3. Start, and wait on desired_state. Without this, the next step is a 409.
await zc.startAgent(agentId)
await zc.waitUntilRunning(agentId)

// 4. A session per conversation; the first message rides along with the create.
const session = await zc.createSession(agentId, {
  initial_events: [{ type: 'user.message', content: 'What is our refund window?' }],
})

// 5. Stream until the turn ends. The stream is session-scoped and does NOT close at turn end -
//    break yourself or you block until the server's idle timeout.
let reply = ''
let cursor: string | undefined // each event's resume token; persist the last one you saw
for await (const ev of zc.streamEvents(agentId, session.session_id)) {
  cursor = ev.cursor ?? cursor
  reply += assistantText(ev) // '' for every event that is not agent.assistant
  if (isRunFinished(ev)) {
    if (runOutcome(ev) !== 'succeeded') throw new Error(`run ${runOutcome(ev)}`)
    break
  }
}
```

Later turns in the same session post onto it and stream again from where you stopped:

```ts
await zc.postEvents(agentId, session.session_id, [{ type: 'user.message', content: 'And for annual plans?' }])

for await (const ev of zc.streamEvents(agentId, session.session_id, cursor ? { cursor } : {})) {
  cursor = ev.cursor ?? cursor
  reply += assistantText(ev)
  if (isRunFinished(ev)) break // required every time: the stream does not end on its own
}
```

---

## Events (quick reference)

Enough to write a correct read loop; `references/events-and-streaming.md` has the vocabulary, the
history-reading path, and the reconnect pattern.

- **The event log is the whole conversation.** Your own inputs echo back as `user.message` (and
  friends) alongside the agent's output, so a message list renders from this one surface - no
  client-side copy of what you sent is needed. An input event's `processedAt` is `null` while
  queued and a timestamp once the agent has consumed it.
- **Read events through the helpers, not by hand.** The wire spells the same event differently
  per lane and transport, and no shape carries a top-level `type`. Everything the SDK returns is
  already normalized to `{ seq, eventType, payload, runId?, turn?, createdAt?, id?, processedAt?,
  cursor? }`. Use `assistantText`, `messageText`, `thinkingText`, `toolCall`, `isRunFinished`,
  `runOutcome` rather than reaching into `payload` yourself.
- **Resume with each event's `cursor` token.** Remember the last one you saw. Reconnect with
  `streamEvents(agentId, sessionId, { cursor })` and the server replays from right after it, so
  nothing is lost; it may re-send the boundary frame, and the generator drops that for you.
  (`{ after: seq }` still works but selects the deprecated engine-only lane - old stored cursors
  only.) **The SDK does not reconnect for you** - it opens one request and the generator ends when
  the server closes on idle. Looping over that is the caller's job.
- **A run can succeed with failed tool calls.** `toolCall(ev).isError === true` does not fail the
  run. Only `runOutcome(ev)` decides.
- **`toolCall(ev).phase` has three values**, not two: `start`, `end`, and `blocked`. A `blocked` call
  is waiting on an approval and has **not** run. Treating it as `end` reports work that never
  happened.
- **`listEvents()` returns one page and drops the page's pagination fields.** Default 100, hard
  cap 500. Use `listAllEvents()` for history - it follows the server's cursor to the end - or
  `listEventsPage()` when paging by hand (same call, keeps `hasMore`/`nextCursor`).

## Writing into a session

Only four event types can be written: `user.message`, `user.interrupt`, `user.tool_confirmation`,
and `system.message`.

`system.message` is worth knowing about - it injects context the model reads on its next turn
without appearing as a user turn. It is the supported way to hand an agent state your own
application owns (the current user's plan, what they just clicked) since there is no memory resource
to write to.

`user.interrupt` cancels an in-flight run. With no run in flight it answers `accepted: false`, which
is a normal reply and not an error.

Give each event an `idempotency_key` (any stable string): a `postEvents` retried after a timeout
then converges instead of delivering the message twice. Accepted events come back as the full event
object the history will show (with its `seq`); an unaccepted interrupt stays a plain receipt.

## Skills (quick reference)

A ZooWork skill is a capability attached to an **agent** - a `SKILL.md` plus its files, synced into
the agent's sandbox and read by the model when it judges the skill relevant. There is no
session-level skill list and no API to invoke one; attaching it changes what the agent knows, not
what you can call.

Four things surprise everyone:

- **Built-in skills that call platform services (speech, video, connectors) need zero setup** -
  the platform injects the credentials they use into the sandbox when it is created. Those env
  vars are platform-internal: a skill you write must not read them (no compatibility promise).
  Anything secret in your own skill belongs on your own service, called over the network.
- **A brand-new agent already has the global catalog attached** (document skills like `docx`,
  `pptx`, `xlsx`, `pdf` among them). You do not install those, and `putAgentSkill()` against a
  `global` entry answers **404** - it is already attached, you just cannot control it. Do not retry
  that 404 and do not write a provisioning step that installs what it found in the catalog.
- **The zip's top-level directory name must equal the `name` in `SKILL.md`'s frontmatter.** This is
  the single most common first failure. `uploadSkill()` takes the zip plus a required
  `{ scope: 'org' | 'personal' }`; `global` is refused on upload.
- **The frontmatter `description` is the trigger; the body is the payload.** The model decides
  whether to load a skill by reading the description ALONE - the body is read afterwards, and only
  if the description won. Write it as *when to use this*, containing the words a user would
  actually say, not as *what this is*. This is the one failure here that reports success at every
  step: the upload succeeds, `putAgentSkill()` succeeds, `listAgentSkills()` returns the row with
  `eligible: true` and a real `basePath`, and the skill still never fires. When a user says their
  skill "does nothing", check the description before anything else.

  ```yaml
  description: Notes about our office coffee bar.                    # never fires
  description: Use whenever the user asks about the office coffee     # fires
    menu, coffee prices, or wants to order a coffee - including the
    words latte, espresso, or americano.
  ```

Uploading a local skill directory and attaching it is the core of
`references/deploy-your-agent.md` - read it when the user has skills of their own.

---

## Reading guide

| The user wants to | Read |
|---|---|
| A signature, a return shape, or a method you are not certain exists | `references/typescript-sdk.md` - all 58 client methods by area |
| Cron schedules (including the `payload.outcome` gate), running a command in the sandbox (`exec`), `wake`, environments, approvals, artifacts, the system prompt, or channels (binding Feishu/Lark) | `references/typescript-sdk.md` - these surfaces appear **nowhere else in this skill**, and each has a trap worth a debugging session (schedule reads and writes speak different vocabularies; `exec` needs an agent-scope sandbox; artifact routes need selectors the SDK derives for you) |
| To consume the stream, read history, reconnect, or render tool calls | `references/events-and-streaming.md` |
| To host an agent they built locally, with its skills - or to run an agent per end user and keep one skill updating the whole fleet | `references/deploy-your-agent.md` - **follow it in order, do not summarize it** |
| Something you suspect is not supported (custom tools, vaults, webhooks, file uploads, approvals, memory) | `references/not-supported.md` - **read before designing**, each entry names the real alternative |

For anything none of those cover, the SDK's shipped `dist/index.d.ts` is the authority, and the
developer documentation is at `https://github.com/SerendipityOneInc/zoowork-agents-docs`. Prefer
either over recalling a shape.

## Common pitfalls

- **Do not poll `actual_state`.** It reports chat-channel health, `running` is not one of its
  values, and an API-only agent parks at `activating` forever - a loop watching it never returns.
  `waitUntilRunning()` polls `desired_state` and throws `408`/`'timeout'` on a spent budget.
- **There is no custom tool type and no tool-result event.** The agent cannot call back into your
  process mid-turn. `references/not-supported.md` - Client-executed custom tools has the two real
  alternatives (a remote MCP server, or doing the work between turns).
- **There is no credential API.** The platform seeds model credentials itself at create, and there
  is no store for your end users' secrets — those belong on your own service.
- **An Environment choice locks permanently** on first sandbox creation. `stopAgent()` does not
  release it, and a later change answers `409 environment_locked`. Decide before the agent's first
  turn or not at all.
- **`createAgent` and `getAgent` return different shapes.** Create hands back a flat receipt with a
  top-level `config_version`; reads return a projection with the config under `declared` and the
  version at `status.config_version`. Reading the wrong one yields `undefined`, and `undefined ===
  undefined` makes a no-op check pass when it should not.
- **`config_version` is not an optimistic-concurrency token.** Every `PUT` bumps it, including one
  that changes nothing, and so does attaching or detaching a skill. A version that moved does not
  tell you your own section changed, so drift detection built on it does not work.
- **Match errors on `ZooworkError.status` and `.type`, never on the message.** There are two error
  vocabularies, because there are two envelopes: the sessions family answers bare codes
  (`agent_not_running`, `session_archived`), the agents family answers dotted ones
  (`service_api.not_found`). Both land on the same class. No error-code constants are exported -
  compare string literals, and prefer `status` when you only need the class of failure.
- **A cross-tenant or unknown id is `404`, not `403`.** So a 404 does not mean deleted. Keep your own
  record of the ids you create.
- **`deleteAgent()` does not clean up after itself.** It leaves the agent's schedules in place and
  they keep firing. Stop the agent, delete its schedules yourself, then delete it.
- **`exec(agentId, args)` takes argv, not a shell string.** Use `['bash', '-lc', 'ls /workspace']`
  for shell semantics. A non-zero exit is still HTTP 200 - the promise resolves, so check
  `exit_code` yourself.
- **`@zoowork-ai/sdk` is TypeScript only.** No Python package is published. For another
  language, call the REST API directly and normalize the two event spellings yourself - say that
  rather than inventing an import.
