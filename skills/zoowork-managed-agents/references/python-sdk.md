# Python SDK surface

The official package is `zoowork`. It supports Python 3.10+, is asynchronous, uses `httpx`, and
keeps public request and response fields in their wire spelling. Client methods and event helpers
use snake_case. Do not mechanically translate payload keys: `custom_tools`, `input_schema`, and
`pending_custom_tool_calls` are snake_case, while the declared timeout remains `timeoutMs` because
that is the public wire field.

The package exports `create_zoowork_client`, `ZooworkClient`, `ZooworkError`, page and custom-tool
types, `SessionEvent`, `ToolCall`, `CustomToolUse`, the two event vocabularies, event helpers, and
`parse_sse`. Unknown response fields and event types are preserved.

## Construction and lifecycle

```python
from zoowork import create_zoowork_client

async with create_zoowork_client() as client:
    models = await client.list_models()
    model = next((row["model"] for row in models if row.get("selectable") is not False), None)
    if model is None:
        raise RuntimeError("no selectable ZooWork model")
```

`create_zoowork_client()` reads `ZOOWORK_API_KEY` and `ZOOWORK_BASE_URL`. You may instead pass the
key as the first argument and `base_url=` explicitly. The default base already ends in
`/service/v1`; do not append another version segment. Keep the organization-wide `zct_` key on a
backend, never in browser or mobile code.

The mandatory lifecycle is:

```python
agent = await client.create_agent(
    {
        "name": "support-agent",
        "model": {"primary": model},
        "userTimezone": "Asia/Shanghai",
    },
    idempotency_key="support-agent-v1",
)
agent_id = agent["agent_id"]
await client.start_agent(agent_id)
await client.wait_until_running(agent_id)
session = await client.create_session(
    agent_id,
    {"initial_events": [{"type": "user.message", "content": "Hello"}]},
)
```

`create_agent()` takes the resource dictionary directly. This differs from TypeScript, whose
method takes `{ resource }`. Every Session method still takes `agent_id` first. Create an Agent
once and persist its id; create a Session for each conversation.

Do not choose the first model row blindly. `list_models()` can include lifecycle rows whose
`selectable` value is false so existing Agents can continue to reference them. A new selection is
rejected with `409 model_not_selectable`; refresh the catalog and use `expired_fallback_to` when
present. `userTimezone` is the wire spelling for the Agent's named IANA timezone; it affects prompt
context and message timestamps, not Schedule timezone.

## Events

```python
from zoowork import assistant_text, is_run_finished, run_outcome

cursor: str | None = None
async for event in client.stream_events(agent_id, session["session_id"]):
    cursor = event.cursor or cursor
    print(assistant_text(event), end="")
    if is_run_finished(event):
        if run_outcome(event) != "succeeded":
            raise RuntimeError(run_outcome(event))
        break
```

The stream is Session-scoped and does not close at turn end. Break on `is_run_finished()`. Resume
by passing `cursor=cursor`; the cursor is opaque. `list_events()` returns one page,
`list_events_page()` keeps `has_more` and `next_cursor`, and `list_all_events()` follows pagination
for you. The normalized event uses `event.event_type`, `event.run_id`, `event.processed_at`, and
`event.created_at`.

Five write-side types exist: `user.message`, `user.interrupt`, `user.tool_confirmation`,
`user.custom_tool_result`, and `system.message`. Give retryable events a stable
`idempotency_key`. A successful `user.interrupt` when nothing runs can return
`accepted: false`; that is a normal no-op, not an exception.

## Filtered Session pages

`list_sessions(agent_id, page=...)` preserves the legacy fixed-50 numeric page lane. Use the
separate cursor method for filters and resumable scans:

```python
cursor: str | None = "sls1:0"
while cursor is not None:
    page = await client.list_session_page(
        agent_id,
        cursor=cursor,
        limit=100,
        exclude_channels=["api"],
        include_surfaces=["inbox"],
        runtime_modes=["active"],
        include_archived=False,
        include_deleted=True,
    )
    for row in page.sessions:
        await index(row)
    cursor = page.next_cursor
```

`limit` is 1–100. Runtime modes are `active`, `preview`, `authoring`, and `evaluation`. The cursor
is bound to the Agent and exact filter scope, so keep filters unchanged; invalid reuse returns
`400 invalid_cursor`. Each row can include `list_cursor` for resuming after a partially consumed
page. `get_session()` and list rows can include `pending_approvals` and
`pending_custom_tool_calls`; both are counts.

Deleted Sessions are omitted by default. `include_deleted=True` adds tombstone rows with
`deleted: true`, and `page.includes_deleted` confirms that mode. The option is part of the cursor
scope and must stay unchanged while continuing. A tombstone is not a readable Session resource.

## Application-executed custom tools

Declare up to 32 tools on the Agent resource:

```python
agent = await client.create_agent(
    {
        "name": "pricing-agent",
        "custom_tools": [
            {
                "name": "lookup_price",
                "description": "Look up one SKU.",
                "input_schema": {
                    "type": "object",
                    "properties": {"sku": {"type": "string"}},
                    "required": ["sku"],
                },
                "timeoutMs": 600_000,
            }
        ],
    }
)
```

Names match `[A-Za-z0-9_-]{1,64}` and cannot shadow built-in, MCP, memory, or runtime-reserved
tools. Descriptions are non-empty and at most 4 KiB; the object schema is at most 16 KiB;
`timeoutMs` defaults to 600,000 and caps at 86,400,000 ms.

Handle and resolve the request in the application:

```python
from zoowork import custom_tool_use

call = custom_tool_use(event)
if call is not None and call.phase == "requested":
    result = await pricing.lookup(call.input["sku"] if call.input else None)
    await client.resolve_custom_tool_call(
        agent_id,
        call.call_id,
        content=[{"type": "json", "value": result}],
        resolved_by="pricing-service",
    )
```

`list_custom_tool_calls(agent_id, status="pending")` recovers outstanding calls. Result content is
1–16 text, JSON, or base64 image blocks; accepted image media types are PNG, JPEG, GIF, and WebP.
The event alternative is `user.custom_tool_result`, using `custom_tool_use_id` or `call_id`,
`content`, optional `is_error`, and a stable `idempotency_key`.

While waiting, the Session's `run_status` is `awaiting_approval`; inspect
`pending_custom_tool_calls` to distinguish custom work from human approval. A REST resolution may
return `202` and `signaled: true` while the row remains pending until the run consumes it. Terminal
calls return `200` with `signaled: false`. This lifecycle is source-reviewed and offline-tested,
not live deployment-verified.

## Agent configuration, MCP, and channels

Agent resource dictionaries accept `userTimezone`, `model`, `persona`, `skills`,
`include_global_skills`, `labels`, `tool_policy`, `mcp`,
`custom_tools`, `system_prompt`, `outcome`, `sandbox`, `environment_id`, and
`environment_version`. `update_agent(agent_id, sections)` updates declared sections. Preserve the
same contract cautions as TypeScript: `tool_policy` and array-valued sections replace their
values; `config_version` increments but is not a rollback handle.

`include_global_skills` defaults to true. False disables automatic global Skills without removing
explicit installs and persists across updates and rerenders. An explicit empty `skills` list at
create also opts out.

MCP `context.meta` and `context.headers` explicitly opt runtime identifiers into calls; they are
not authentication. `permission` sets `always_ask` or `always_allow` for the server, and `tools`
overrides exact native tool names, with no wildcard and a maximum of 64 entries. Tool-policy
selectors separately support an exact name, global `*`, or one trailing `prefix*`.

Direct DingTalk uses `platform: "dingtalk-connector"`, `dm_policy: "open"`, and a config with
`clientId` and `clientSecret`; it has no guided setup. Feishu document administration uses
`permission_admin_enabled: True`. A stored channel receipt is not readiness: inspect returned
capability sync and provider states.

## Method groups

- Agents: `list_models`, `create_agent`, `list_agents`, `iter_agents`, `get_agent`,
  `update_agent`, `delete_agent`, `start_agent`, `stop_agent`, `wait_until_running`.
- Agent skills and registry: `list_agent_skills`, `put_agent_skill`, `delete_agent_skill`,
  `upload_skill`, `upload_skill_version`, `list_skills`, `delete_skill`.
- Channels: `list_channels`, `add_channel`, `update_channel`, `remove_channel`, generic guided
  setup methods, and Feishu compatibility methods.
- Sessions and events: `create_session`, `get_session`, `list_sessions`, `list_session_page`,
  archive/delete, post/list/stream events, and the custom-tool methods above.
- Approvals, artifacts, system prompts, schedules, `wake`, `exec`, Environments, and immutable
  Environment versions mirror the TypeScript public capability groups with snake_case names.

Read `references/typescript-sdk.md` for the shared wire semantics of a capability not expanded
here, but write Python names and calling conventions. The Python source and annotations remain
the authority for the exact signature.

## Errors

Every non-success response raises `ZooworkError`. Match `error.status` and `error.type`, never its
message. It also preserves `content_type`, `body_snippet`, `cf_ray`, `request_id`, and
`retryable`. Always close the async client, preferably through `async with`.
