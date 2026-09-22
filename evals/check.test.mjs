// Synthetic checker regression inputs, NOT assistant-generated behavioral eval outputs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

function check(id, source) {
  const dir = mkdtempSync(join(tmpdir(), 'zoowork-checker-'))
  try {
    writeFileSync(join(dir, 'answer.ts'), source)
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('./check.mjs', import.meta.url)), dir, '--eval', String(id), '--json'], { encoding: 'utf8' })
    assert.equal(run.error, undefined)
    assert.ok(run.status === 0 || run.status === 1, run.stderr)
    const report = JSON.parse(run.stdout)
    assert.equal(report.results.length, 1)
    return { status: run.status, result: report.results[0] }
  } finally {
    rmSync(dir, { recursive: true, force: true }) // only this test's mkdtemp directory
  }
}

test('complete-export tripwire rejects bounded history and a single page', () => {
  for (const source of [
    'const s = await zc.getSession(a, s, { history: true, limit: 500 }); await writeFile(path, JSON.stringify(s.history))',
    'const page = await zc.listEventsPage(a, s); await writeFile(path, JSON.stringify(page.events))',
  ]) assert.equal(check(3, source).status, 1)
})

test('complete-export tripwire accepts the helper and explicit cursor pagination', () => {
  assert.equal(check(3, 'const events = await zc.listAllEvents(a, s); await writeFile(path, JSON.stringify(events))').status, 0)
  assert.equal(check(3, 'let cursor; while (true) { const page = await zc.listEventsPage(a, s, { cursor }); all.push(...page.events); if (!page.hasMore) break; cursor = page.nextCursor; }').status, 0)
})

test('reconnect tripwire rejects seq/after and accepts cursor with cancellation', () => {
  assert.equal(check(5, 'for await (const ev of zc.streamEvents(a, s, { after: lastSeq, signal })) { lastSeq = ev.seq }').status, 1)
  assert.equal(check(5, 'for await (const ev of zc.streamEvents(a, s, { cursor, signal })) { cursor = ev.cursor ?? cursor }').status, 0)
})

test('contract tripwire rejects old interval/version shapes', () => {
  assert.equal(check(8, 'createSchedule(a, { schedule: { kind: "every", every: 60 } }); const v = await zc.uploadSkillVersion(id, zip); console.log(v.latest_version, v.status)').status, 1)
  assert.equal(check(8, 'createSchedule(a, { schedule: { kind: "every", everyMs: 60_000 } }); const v = await zc.uploadSkillVersion(id, zip); console.log(v.version, v.state); if (run.session_id) use(run.session_id)').status, 0)
})

test('custom-tool tripwire requires declaration, handling, recovery and evidence boundary', () => {
  assert.equal(check(4, 'Use an MCP server because custom tools are not supported.').status, 1)
  assert.equal(check(4, `
    custom_tools: [{ name: 'lookup_price', input_schema: { type: 'object' } }]
    const call = customToolUse(ev)
    await zc.resolveCustomToolCall(agentId, call.callId, { content: [{ type: 'json', value }] })
    await zc.listCustomToolCalls(agentId, { status: 'pending' })
    // source-reviewed, not live-verified
  `).status, 0)
})

test('Python SDK tripwires keep snake_case custom-tool and cursor methods', () => {
  assert.equal(check(15, 'const zc = createZooworkClient(); await zc.waitUntilRunning(id)').status, 1)
  assert.equal(check(15, `
    from zoowork import create_zoowork_client, assistant_text, is_run_finished
    agent = await client.create_agent({})
    await client.start_agent(agent_id)
    await client.wait_until_running(agent_id)
    session = await client.create_session(agent_id, {})
    async for event in client.stream_events(agent_id, session_id):
        print(assistant_text(event))
        if is_run_finished(event): break
  `).status, 0)

  assert.equal(check(16, `
    custom_tools = [{"name": "lookup_price", "input_schema": {"type": "object"}}]
    call = custom_tool_use(event)
    pending = await client.list_custom_tool_calls(agent_id, status="pending")
    await client.resolve_custom_tool_call(agent_id, call.call_id, content=[{"type": "json", "value": 1}])
    cursor = "sls1:0"
    page = await client.list_session_page(agent_id, cursor=cursor, exclude_channels=["api"], runtime_modes=["active"])
    # source-reviewed, not deployment-verified
  `).status, 0)
})

test('lifecycle and usage boundary tripwire rejects unsafe model and invented Usage APIs', () => {
  assert.equal(check(17, `
    const model = (await zc.listModels())[0].model
    const usage = await zc.getUsage()
    await fetch('/service/v1/usage')
  `).status, 1)

  assert.equal(check(17, `
    const model = (await zc.listModels()).find((row) => row.selectable !== false)?.model
    const resource = {
      model: { primary: model },
      userTimezone: 'Asia/Shanghai',
      include_global_skills: false,
    }
    let cursor
    do {
      const page = await zc.listSessionPage(agentId, { cursor, includeDeleted: true })
      for (const session of page.sessions) if (session.deleted) reconcile(session.session_id)
      cursor = page.next_cursor ?? undefined
    } while (cursor)
    // No public Usage API or public usage-page URL is currently documented.
  `).status, 0)
})
