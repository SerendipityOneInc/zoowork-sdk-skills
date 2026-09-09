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
