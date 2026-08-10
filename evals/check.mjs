#!/usr/bin/env node
// Check the code an assistant produced against the assertions in evals.json.
//
//   node evals/check.mjs <run-directory> [--eval <id>] [--json]
//
// The run directory holds whatever the assistant wrote for one eval: source files, and
// optionally transcript.md / answer.md for prompts whose answer is prose rather than code.
// Every readable file under it is concatenated and matched as one document, so an assertion
// satisfied in a comment or in prose counts - that is deliberate. An assistant that says
// "client-executed custom tools are not supported" has passed eval 4 whether it said so in a
// code comment or in its reply.
//
// These checks are a regression tripwire, not a grader. They catch the specific mistakes an
// unaided assistant makes on this API. Read the output yourself before drawing a conclusion.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.wrangler'])
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.pdf', '.zip', '.lock', '.ico', '.woff', '.woff2'])

function collect(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...collect(p))
    else if (!SKIP_EXT.has(extname(name)) && st.size < 2_000_000) out.push(p)
  }
  return out
}

function firstIndex(text, pattern) {
  const m = new RegExp(pattern).exec(text)
  return m ? m.index : -1
}

function evaluate(assertion, text) {
  const { kind, patterns } = assertion
  if (kind === 'present') {
    const hit = patterns.find((p) => firstIndex(text, p) >= 0)
    return hit ? { passed: true, evidence: `matched /${hit}/` } : { passed: false, evidence: `none of ${patterns.length} patterns matched` }
  }
  if (kind === 'absent') {
    const hit = patterns.find((p) => firstIndex(text, p) >= 0)
    return hit ? { passed: false, evidence: `found /${hit}/, which should not appear` } : { passed: true, evidence: 'clean' }
  }
  if (kind === 'order') {
    let prev = -1
    for (const p of patterns) {
      const i = firstIndex(text.slice(prev + 1), p)
      if (i < 0) return { passed: false, evidence: `/${p}/ never appears after the previous pattern` }
      prev = prev + 1 + i
    }
    return { passed: true, evidence: `${patterns.join(' then ')}` }
  }
  return { passed: false, evidence: `unknown assertion kind ${kind}` }
}

const args = process.argv.slice(2)
const runDir = args.find((a) => !a.startsWith('--'))
const asJson = args.includes('--json')
const onlyId = args.includes('--eval') ? Number(args[args.indexOf('--eval') + 1]) : undefined

if (!runDir) {
  console.error('usage: node evals/check.mjs <run-directory> [--eval <id>] [--json]')
  process.exit(2)
}

const suite = JSON.parse(readFileSync(join(HERE, 'evals.json'), 'utf8'))
const files = collect(runDir)
const text = files.map((f) => readFileSync(f, 'utf8')).join('\n\n')

const evals = suite.evals.filter((e) => onlyId === undefined || e.id === onlyId)
const results = evals.map((e) => {
  const checks = e.assertions.map((a) => ({ text: a.name, ...evaluate(a, text) }))
  return { id: e.id, name: e.name, checks, passed: checks.filter((c) => c.passed).length, total: checks.length }
})

if (asJson) {
  console.log(JSON.stringify({ run: runDir, files: files.length, results }, null, 2))
} else {
  console.log(`${runDir}  (${files.length} files, ${text.length} chars)\n`)
  for (const r of results) {
    console.log(`eval ${r.id} ${r.name}  ${r.passed}/${r.total}`)
    for (const c of r.checks) console.log(`  ${c.passed ? 'pass' : 'FAIL'}  ${c.text}${c.passed ? '' : `  (${c.evidence})`}`)
    console.log()
  }
  const p = results.reduce((n, r) => n + r.passed, 0)
  const t = results.reduce((n, r) => n + r.total, 0)
  console.log(`total ${p}/${t}`)
}

process.exitCode = results.some((r) => r.passed < r.total) ? 1 : 0
