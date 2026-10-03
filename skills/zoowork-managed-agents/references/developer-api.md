# Files, Database, Usage and webhooks

Read this before integrating these capability groups. These helpers are source-reviewed and
covered by offline SDK tests. Check the installed SDK exports/source first; do not assume an
older registry release contains a newly added method. If absent, use the corresponding documented
HTTP route with the existing backend client configuration. Do not upgrade or make live writes
merely to answer a capability question.

## Method mapping

| TypeScript | Python | Public contract |
|---|---|---|
| `getWorkspaceFile(agentId, path, { showHidden? })` | `get_workspace_file(agent_id, path, show_hidden=...)` | GET Agent files: text file or directory entries |
| `writeWorkspaceFile(agentId, path, content)` | `write_workspace_file(agent_id, path, content)` | POST Agent files: text write |
| `getWorkspaceFileContent(agentId, path, { download? })` | `get_workspace_file_content(agent_id, path, download=...)` | GET files/content: Uint8Array / bytes |
| `getAgentDatabase(agentId)` | `get_agent_database(agent_id)` | Read-only database catalog |
| `getAgentDatabaseRows(agentId, table, { limit?, offset? })` | `get_agent_database_rows(agent_id, table, limit=..., offset=...)` | Read-only rows; limit 1–100, offset nonnegative |
| `getUsage({ range?, groupBy?, view?, perPage?, snapshot?, cursor? })` | `get_usage(range=..., group_by=..., view=..., per_page=..., snapshot=..., cursor=...)` | GET /service/v1/usage; current key scope |
| `getRunOutput(agentId, sessionId, runId, { cursor?, limit? })` | `get_run_output(agent_id, session_id, run_id, cursor=..., limit=...)` | One run's output, with completion and paging metadata |
| `getApproval(agentId, approvalId)` | `get_approval(agent_id, approval_id)` | Pending or terminal approval |
| `getCustomToolCall(agentId, callId)` | `get_custom_tool_call(agent_id, call_id)` | Pending or terminal application-executed tool call |
| `listApprovalPage(agentId, { status?, sessionId?, cursor?, limit? })` | `list_approval_page(agent_id, status=..., session_id=..., cursor=..., limit=...)` | Object with approvals, has_more, next_cursor |
| `listCustomToolCallPage(agentId, opts)` | `list_custom_tool_call_page(agent_id, **opts)` | Object with custom_tool_calls, has_more, next_cursor |

File reads derive owner/org selectors from the Agent projection. Do not accept caller-supplied
selectors to widen authorization. Text writes do not upload arbitrary binary inputs. Database
reads do not provision a missing database: handle `status: 'not_provisioned'` normally.

Use `range: '24h' | '7d' | '30d'`, `groupBy: 'session' | 'api_key'`, and
`view: 'groups' | 'records' | 'both'` for Usage. Other filters include session/key/root-session,
attribution, timezone, page, as-of and snapshot/cursor. Python uses snake_case for helper
parameters. Responses retain API spelling and unknown fields. Reporting does not enforce a
Session dollar cap.

Action lists allow omitted or pending status. Original list methods still return arrays; page
methods opt into pagination and retain metadata. Detail reads do not require pending status.
Replay every cursor unchanged. Pending IDs in a Session projection include completeness flags;
if incomplete, page the authoritative action list. A resolution's signaled=true acknowledges
acceptance; it does not prove the run consumed the result.

Run Output contains text and artifact references. An artifact_id can be null; download only a
non-null ID through the Artifact API. Follow next_cursor while has_more is true. A running run
can have no next page and still be incomplete: require output_complete=true for a complete result.

## Agent webhook management

All management is under `/service/v1/agents/{agent_id}/webhooks`.

| TypeScript | Python |
|---|---|
| listAgentWebhooks | list_agent_webhooks |
| createAgentWebhook | create_agent_webhook |
| getAgentWebhook | get_agent_webhook |
| updateAgentWebhook | update_agent_webhook |
| deleteAgentWebhook | delete_agent_webhook |
| rotateAgentWebhookSecret | rotate_agent_webhook_secret |
| testAgentWebhook | test_agent_webhook |
| getAgentWebhookEvent | get_agent_webhook_event |
| listAgentWebhookDeliveries | list_agent_webhook_deliveries |
| getAgentWebhookDelivery | get_agent_webhook_delivery |
| redeliverAgentWebhookDelivery | redeliver_agent_webhook_delivery |
| redeliverAgentWebhookDeliveries | redeliver_agent_webhook_deliveries |

```ts
const created = await zc.createAgentWebhook(agentId, {
  url: 'https://receiver.example/webhook',
  event_types: ['run.finished', 'approval.requested'],
}, 'register-hook-v1')
// Store a non-null signing_secret securely; never log it.
const page = await zc.listAgentWebhooks(agentId) // page.webhooks
const receipt = await zc.testAgentWebhook(agentId, created.endpoint.id, 'test-hook-v1')
const deliveries = await zc.listAgentWebhookDeliveries(agentId, created.endpoint.id, {
  eventType: 'webhook.test',
})
```

```python
created = await client.create_agent_webhook(
    agent_id,
    {"url": "https://receiver.example/webhook", "event_types": ["run.finished"]},
    idempotency_key="register-hook-v1",
)
page = await client.list_agent_webhooks(agent_id)  # page["webhooks"]
receipt = await client.test_agent_webhook(
    agent_id, created["endpoint"]["id"], idempotency_key="test-hook-v1",
)
```

Create, rotation, test and redelivery require a stable idempotency key. SDK writes do not retry
automatically. A replay can return signing_secret=null and signing_secret_available=false after
revocation; do not assume every successful response provides usable plaintext. Rotation accepts
revoke_previous_after of 0 or 86400. Endpoint updates and deletion use POST action paths.

A 202 receipt acknowledges queuing, not delivery or business processing. Query delivery list/detail
for attempts and outcome. Delivery filters include status, event type/id, session, run and schedule.
Endpoint list filters are only cursor/limit. Preserve cursor timestamps without parsing them.
Batch redelivery selects dead deliveries and accepts since, event_types and a limit.

## Receiver acceptance

1. Read raw bytes before JSON parsing and enforce the 16 KiB body ceiling.
2. Verify using unwrapWebhook / unwrap_webhook and the signing secret. Configure all active
   secrets during rotation. Signature timestamp tolerance defaults to 300 seconds.
3. Check the parsed event id equals the verified webhook-id header.
4. Atomically persist a deduplicated event and durable work item keyed by webhook-id. Return
   success for an already accepted duplicate. If durable acceptance fails, return 5xx.
5. Acknowledge only after acceptance. A worker performs application side effects and must
   reconcile crash/retry uncertainty independently.
6. Accept unknown event types without unsupported-type failures. Validate event-specific data
   in the worker. Never log secrets, signatures, raw bodies or protected customer payloads.

Known events include run/session/action/schedule lifecycle and schedule configuration changes.
Webhook subscriptions are independent of schedule delivery settings. After run.finished, query
Run Output; after approval/custom-tool requests, read by ID and resolve through the existing
application endpoints. A test event requires no billable Agent turn.
