#!/usr/bin/env node
// Judges whether each gap-task reply told the user about the SDK version gap.
//
//   node evals/version-gap/judge.mjs <out-dir> [--model claude-haiku-5-5] [--concurrency 8]
//
// A regular expression cannot tell "0.10.2 lacks uploadFile; 0.11.0 adds it" from "no upgrade was
// made" or from the wrong claim "ZooWork cannot upload files". A small model reads each reply
// against a fixed rubric and writes judge.json next to it; grade.mjs uses that verdict for
// "informed" when it exists. Read the reply when a verdict looks wrong.
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { grade } from './grade.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const [out, ...rest] = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : fallback
}
const MODEL = opt('model', 'claude-haiku-5-5')
const CONCURRENCY = Number(opt('concurrency', 8))
const CLAUDE = process.env.CLAUDE_BIN ?? join(homedir(), '.claude/local/claude')
const { pins, tasks } = JSON.parse(readFileSync(join(HERE, 'tasks.json'), 'utf8'))

function rubric(task, answer) {
  const sdk = task.fixture === 'ts' ? `@zoowork-ai/sdk ${pins.ts} (TypeScript)` : `zoowork ${pins.py} (Python)`
  return `You are grading a coding assistant's final reply to a developer.

The developer's project pins ${sdk}. The developer asked for something that needs ${task.feature}.
The pinned SDK version does not have it; a newer SDK release adds it. ZooWork itself supports the
feature.

Answer YES if the reply tells the developer that the installed SDK version lacks this feature, or
that a newer SDK version provides it or is needed for it. A reply that offers a workaround and also
says this counts as YES.

Answer NO if the reply does not mention that the installed version lacks the feature, including when
it only says the SDK was not upgraded, or when it claims ZooWork or its API does not support the
feature at all.

Reply with exactly one word: YES or NO.

<reply>
${answer}
</reply>`
}

function ask(prompt) {
  return new Promise((done) => {
    const child = spawn(CLAUDE, ['-p', '--model', MODEL, '--setting-sources', 'project,local', '--tools', ''], { cwd: HERE, stdio: ['pipe', 'pipe', 'pipe'] })
    let text = ''
    child.stdout.on('data', (c) => { text += c })
    child.stdin.end(prompt)
    child.on('close', () => done(text.trim()))
  })
}

const jobs = readdirSync(out)
  .map((name) => join(out, name))
  .filter((dir) => existsSync(join(dir, 'result.json')))
  .map((dir) => ({ dir, result: JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')) }))
  .filter(({ result }) => tasks.find((t) => t.id === result.task)?.kind === 'gap')

let next = 0
async function worker() {
  while (next < jobs.length) {
    const { dir, result } = jobs[next++]
    const task = tasks.find((t) => t.id === result.task)
    const answer = readFileSync(join(dir, 'answer.md'), 'utf8')
    const verdict = await ask(rubric(task, answer))
    const informed = /^YES\b/i.test(verdict)
    writeFileSync(join(dir, 'judge.json'), JSON.stringify({ model: MODEL, verdict, informed }, null, 2))
    const regraded = { ...result, ...grade(dir, task, pins) }
    writeFileSync(join(dir, 'result.json'), JSON.stringify(regraded, null, 2))
    console.log(`${dir.split('/').pop()}: ${verdict} -> ${regraded.pass ? 'PASS' : 'FAIL'}`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
