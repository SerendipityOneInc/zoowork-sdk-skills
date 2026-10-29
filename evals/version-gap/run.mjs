#!/usr/bin/env node
// Runs the version-gap eval: coding assistants working in projects pinned to an older SDK.
//
//   node evals/version-gap/run.mjs --cache <dir> --out <dir> [--agents claude,codex]
//     [--arms baseline,annotated,package-agents-md,bundled-docs] [--tasks <id,...>]
//     [--reps 3] [--concurrency 6]
//
// Run prepare.sh first. Each run gets a fresh copy of the fixture, the arm's docs or package
// files, and the Quickstart coding-assistant prompt with the task appended. The docs are served
// from the cache on 127.0.0.1, so every arm reads the same snapshot of the site. ZOOWORK_API_KEY
// is a dummy value and nothing calls a ZooWork API; the runs only spend model tokens.
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { grade } from './grade.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
)
const CACHE = resolve(args.cache ?? '')
const OUT = resolve(args.out ?? '')
if (!args.cache || !args.out) throw new Error('usage: run.mjs --cache <dir> --out <dir>')

const { pins, tasks: allTasks } = JSON.parse(readFileSync(join(HERE, 'tasks.json'), 'utf8'))
const pick = (value, all) => (value ? value.split(',') : all)
const AGENTS = pick(args.agents, ['claude', 'codex'])
const TASKS = allTasks.filter((t) => pick(args.tasks, allTasks.map((x) => x.id)).includes(t.id))
const REPS = Number(args.reps ?? 3)
const CONCURRENCY = Number(args.concurrency ?? 6)
const TIMEOUT_MS = 20 * 60 * 1000

const PORTS = { current: 18091, annotated: 18092 }
const PACKAGE_AGENTS_LINE =
  'If the project already has the SDK installed, first read the AGENTS.md inside the installed ' +
  'package (node_modules/@zoowork-ai/sdk/AGENTS.md, or AGENTS.md in the installed zoowork package ' +
  'directory).'
const BUNDLED_DOCS_LINE =
  'If the installed SDK package has a docs/ directory (node_modules/@zoowork-ai/sdk/docs/, or docs/ ' +
  'in the installed zoowork package directory), read those pages instead of the website; they match ' +
  'the installed SDK version.'
const ARMS = {
  baseline: { docs: 'current' },
  annotated: { docs: 'annotated' },
  'package-agents-md': { docs: 'current', packageAgentsMd: true, promptLine: PACKAGE_AGENTS_LINE },
  'bundled-docs': { docs: 'current', bundledDocs: true, promptLine: BUNDLED_DOCS_LINE },
}
const ARM_NAMES = pick(args.arms, Object.keys(ARMS))

const CLAUDE = process.env.CLAUDE_BIN ?? join(homedir(), '.claude/local/claude')
const CODEX = process.env.CODEX_BIN ?? 'codex'
const CODEX_MODEL = process.env.CODEX_MODEL ?? 'gpt-6-sol'

function docsBase(arm) {
  return `http://127.0.0.1:${PORTS[ARMS[arm].docs]}`
}

// The prompt users copy from the Quickstart, pointed at the local copy of the docs.
function buildPrompt(arm, task) {
  const md = readFileSync(join(CACHE, `docs-${ARMS[arm].docs}`, 'docs/get-started/quickstart.md'), 'utf8')
  const block = md.match(/```text\n([\s\S]*?)\n```/)
  if (!block) throw new Error('no prompt block in quickstart.md')
  let prompt = block[1].replaceAll('https://zoowork.ai/docs/', `${docsBase(arm)}/docs/`)
  const line = ARMS[arm].promptLine
  if (line) {
    const anchor = 'do not\nwrite ZooWork code from memory.'
    if (!prompt.includes(anchor)) throw new Error('prompt anchor moved; update run.mjs')
    prompt = prompt.replace(anchor, `${anchor}\n\n${line}`)
  }
  return `${prompt}\n\nWhat I need: ${task.request}\n`
}

function sh(cmd, argv, cwd) {
  return execFileSync(cmd, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
}

function packageDir(ws, fixture) {
  if (fixture === 'ts') return join(ws, 'node_modules/@zoowork-ai/sdk')
  return sh(join(ws, '.venv/bin/python'), ['-c', 'import zoowork, os; print(os.path.dirname(zoowork.__file__))']).trim()
}

function copyMarkdown(from, to) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name)
    if (entry.isDirectory()) copyMarkdown(src, join(to, entry.name))
    else if (/\.(md|txt)$/.test(entry.name)) cpSync(src, join(to, entry.name))
  }
}

function setupWorkspace(ws, arm, task) {
  if (task.fixture === 'ts') {
    cpSync(join(CACHE, 'ts-template'), ws, { recursive: true })
  } else {
    cpSync(join(HERE, 'fixtures/py'), ws, { recursive: true })
    sh('uv', ['venv', '-q', '--python', '3.12', join(ws, '.venv')])
    sh('uv', ['pip', 'install', '-q', '--python', join(ws, '.venv/bin/python'), '-r', join(ws, 'requirements.txt')])
  }
  writeFileSync(join(ws, '.gitignore'), 'node_modules/\n.venv/\n')
  sh('git', ['init', '-q'], ws)
  sh('git', ['add', '-A'], ws)
  sh('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.com', 'commit', '-qm', 'fixture'], ws)

  const pkg = packageDir(ws, task.fixture)
  const version = pins[task.fixture]
  if (ARMS[arm].packageAgentsMd) {
    const template = readFileSync(join(HERE, `arms/package-AGENTS.${task.fixture}.md`), 'utf8')
    writeFileSync(join(pkg, 'AGENTS.md'), template.replaceAll('{{VERSION}}', version).replaceAll('{{DOCS}}', `${docsBase(arm)}/docs`))
    if (task.fixture === 'py') cpSync(join(CACHE, 'py-CHANGELOG.md'), join(pkg, 'CHANGELOG.md'))
  }
  if (ARMS[arm].bundledDocs) copyMarkdown(join(CACHE, 'docs-snapshot/docs'), join(pkg, 'docs'))
}

function runAgent(agent, ws, runDir, prompt) {
  // A dummy key in the Platform key format. It is never valid; no run calls a ZooWork API.
  const env = { ...process.env, ZOOWORK_API_KEY: `zwp_live_evaldummy${randomBytes(6).toString('hex')}` }
  delete env.ZOOWORK_BASE_URL
  let cmd
  let argv
  if (agent === 'claude') {
    cmd = CLAUDE
    argv = ['-p', '--setting-sources', 'project,local', '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Bash Read Write Edit Glob Grep WebFetch', '--output-format', 'stream-json', '--verbose']
  } else {
    // A private CODEX_HOME keeps the user's global AGENTS.md, MCP servers and config out of the run.
    const home = join(runDir, 'codex-home')
    mkdirSync(home, { recursive: true })
    symlinkSync(join(homedir(), '.codex/auth.json'), join(home, 'auth.json'))
    env.CODEX_HOME = home
    cmd = CODEX
    argv = ['exec', '--ephemeral', '--skip-git-repo-check', '-m', CODEX_MODEL, '-c', 'model_reasoning_effort=high',
      '--dangerously-bypass-approvals-and-sandbox', '-C', ws, '--json', '-o', join(runDir, 'answer.md'), '-']
  }
  return new Promise((done) => {
    const child = spawn(cmd, argv, { cwd: ws, env, stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks = []
    child.stdout.on('data', (c) => chunks.push(c))
    child.stderr.on('data', (c) => chunks.push(c))
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS)
    child.stdin.end(prompt)
    child.on('close', (code) => {
      clearTimeout(timer)
      const transcript = Buffer.concat(chunks).toString('utf8')
      writeFileSync(join(runDir, 'transcript.jsonl'), transcript)
      if (agent === 'claude') {
        const result = transcript.split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } })
          .filter((m) => m?.type === 'result').pop()
        writeFileSync(join(runDir, 'answer.md'), result?.result ?? '')
      }
      done(code)
    })
  })
}

function serveDocs() {
  return Object.entries(PORTS).map(([name, port]) =>
    spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', join(CACHE, `docs-${name}`)], { stdio: 'ignore' }))
}

const jobs = []
for (const agent of AGENTS) for (const arm of ARM_NAMES) for (const task of TASKS) for (let rep = 1; rep <= REPS; rep++) jobs.push({ agent, arm, task, rep })

const servers = serveDocs()
await new Promise((r) => setTimeout(r, 1000))
mkdirSync(OUT, { recursive: true })
let next = 0
let finished = 0
async function worker() {
  while (next < jobs.length) {
    const { agent, arm, task, rep } = jobs[next++]
    const runDir = join(OUT, `${agent}__${arm}__${task.id}__${rep}`)
    if (existsSync(join(runDir, 'result.json'))) { finished++; continue }
    mkdirSync(runDir, { recursive: true })
    const ws = join(runDir, 'ws')
    const started = Date.now()
    try {
      setupWorkspace(ws, arm, task)
      const prompt = buildPrompt(arm, task)
      writeFileSync(join(runDir, 'prompt.txt'), prompt)
      const exit = await runAgent(agent, ws, runDir, prompt)
      const result = { agent, arm, task: task.id, rep, exit, seconds: Math.round((Date.now() - started) / 1000), ...grade(runDir, task, pins) }
      writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2))
      console.log(`[${++finished}/${jobs.length}] ${agent} ${arm} ${task.id} #${rep}: ${result.pass ? 'PASS' : 'FAIL'} ${result.notes.join('; ')}`)
    } catch (error) {
      writeFileSync(join(runDir, 'error.txt'), String(error?.stack ?? error))
      console.log(`[${++finished}/${jobs.length}] ${agent} ${arm} ${task.id} #${rep}: ERROR ${error?.message}`)
    }
  }
}
try {
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
} finally {
  for (const s of servers) s.kill()
}
