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

For Agent Build, create or reopen the Build Session with `CreateBuildAgent` or `OpenBuildSession`.
Send text on that Session and use the event's run ID with `GetBuildRun` to check the saved and
applied revision. Use `ListRevisions` and `GetRevisionDiff` to inspect saved changes. For a shared
Agent installation, use `PreviewInstall` and pass the source revision ID it returns to
`InstallSharedAgent`.

For a Session model update, read `GetSessionModel` first. Send its selection and config versions
back as `expected_selection_version` and `expected_config_version` in `UpdateSessionModel`.
Use `"model_id": nil` to restore the Agent's model and thinking settings. Setting a thinking
level pins the current model to the Session. A Session following an `auto` Agent without a
selected model also needs a `model_id` when setting a level.

For incoming webhooks, pass the original request bytes and HTTP headers to `UnwrapWebhook`
before consuming data. Use a secret from server-side configuration. See the public
[webhook guide](https://zoowork.ai/docs/build/webhooks.md) for verification and delivery handling.
