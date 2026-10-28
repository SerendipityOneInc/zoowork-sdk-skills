#!/usr/bin/env node
// Prints pass counts and failure reasons per agent and arm from a run directory.
//
//   node evals/version-gap/summarize.mjs <out-dir>
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const out = process.argv[2]
const results = readdirSync(out)
  .map((d) => join(out, d, 'result.json'))
  .filter(existsSync)
  .map((f) => JSON.parse(readFileSync(f, 'utf8')))

const key = (...parts) => parts.join(' | ')
const groups = new Map()
for (const r of results) {
  const k = key(r.agent, r.arm, r.task)
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(r)
}

const tasks = [...new Set(results.map((r) => r.task))]
const rows = [...new Set(results.map((r) => key(r.agent, r.arm)))]
console.log(`| agent | arm | ${tasks.join(' | ')} | gap total |`)
console.log(`|---|---|${tasks.map(() => '---').join('|')}|---|`)
for (const row of rows) {
  const cells = tasks.map((t) => {
    const rs = groups.get(`${row} | ${t}`) ?? []
    return `${rs.filter((r) => r.pass).length}/${rs.length}`
  })
  const gap = results.filter((r) => key(r.agent, r.arm) === row && r.task !== 'ts-control')
  console.log(`| ${row} | ${cells.join(' | ')} | ${gap.filter((r) => r.pass).length}/${gap.length} |`)
}

console.log('\nFailure reasons (runs can have several):\n')
console.log('| agent | arm | typecheck failed | upgraded | deprecated method | not informed | control not implemented |')
console.log('|---|---|---|---|---|---|---|')
for (const row of rows) {
  const rs = results.filter((r) => key(r.agent, r.arm) === row)
  const gap = rs.filter((r) => r.task !== 'ts-control')
  const control = rs.filter((r) => r.task === 'ts-control')
  console.log(`| ${row} | ${rs.filter((r) => !r.typecheck).length} | ${rs.filter((r) => r.upgraded).length} | ` +
    `${rs.filter((r) => r.deprecated).length} | ${gap.filter((r) => !r.informed).length} | ` +
    `${control.filter((r) => !r.implemented).length} |`)
}
