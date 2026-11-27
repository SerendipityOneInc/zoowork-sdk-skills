# Go SDK

Check the project's `go.mod` for `github.com/SerendipityOneInc/zoowork-sdk-go`. The module
requires Go 1.26 or later. Use `go doc github.com/SerendipityOneInc/zoowork-sdk-go.Client` for
the installed signatures and [the Go SDK reference](https://zoowork.ai/docs/reference/go-sdk.md)
for the matching examples. For a new dependency, use a published version with `go get` from
your project.

`zoowork.NewClient(zoowork.Config{})` uses `ZOOWORK_API_KEY` and the default public API base.
The backend can set `Config.APIKey` and `Config.BaseURL` explicitly. Pass a context through
each operation. Use a deadline for a bounded turn.

1. Read `ListModels(ctx)` and select an available model. Supply the model explicitly when
   calling `CreateAgent(ctx, input, idempotencyKey)`.
2. Start the Agent and wait with `WaitUntilRunning(ctx, agentID, zoowork.WaitOptions{})`.
3. Create a Session with `CreateSession(ctx, agentID, input, idempotencyKey)`. To send a later
   message, call `PostEvents(ctx, agentID, sessionID, events)` and check `receipt["accepted"]`.
4. Use `for event, err := range client.StreamEvents(ctx, agentID, sessionID, opts)`. Process
   each event before saving its opaque `event.Cursor`. Use `zoowork.AssistantText(event)` for
   reply text. Break at `zoowork.IsRunFinished(event)` and read `zoowork.RunOutcome(event)`.
5. Set `StreamEventsOptions.Cursor` to a pointer to the saved cursor when resuming.

`Object` preserves the request and response field names from the API. Numeric values in an
open response object use `encoding/json.Number`. Use `ListEventsPage` and its `NextCursor` to
page through durable history, or `ListAllEvents` for the full history. Check failures with
`errors.As` and `*zoowork.Error`. Its `Type` and `Code` are exact server values.

For incoming webhooks, pass the original request bytes and HTTP headers to `UnwrapWebhook`
before consuming data. Use a secret from server-side configuration. See the public
[webhook guide](https://zoowork.ai/docs/build/webhooks.md) for verification and delivery handling.
