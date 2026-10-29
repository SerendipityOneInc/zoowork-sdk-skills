// Grades one version-gap run from what the assistant left behind: the workspace and its reply.
//
//   node evals/version-gap/grade.mjs <run-dir>...   (re-grade finished runs)
//
// A gap task passes when the code still type-checks against the SDK the project installs, the
// SDK was not upgraded, no deprecated workspace-file method was used as a workaround (they fail
// with HTTP 502), and the reply tells the user about the version gap. A control task, which the
// pinned SDK supports, passes when the change type-checks, the SDK was not upgraded, and the change
// was made. "informed" comes from judge.mjs when it has run, and from a regular expression over the
// reply otherwise; the expression alone is too crude to trust, so run the judge.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKIP = new Set(['node_modules', '.venv', '.git', 'codex-home'])
const DEPRECATED = /\b(writeWorkspaceFile|getWorkspaceFile|getWorkspaceFileContent|write_workspace_file|get_workspace_file|get_workspace_file_content)\s*\(/
const INFORMED = /\b0\.1[1-3](\.\d+)?\b|\b0\.[678]\.\d\b|upgrad|newer (release|version|sdk)|\black(s|ing)?\b|(not|isn't|doesn't|does not|is not) (yet )?(available|exist|support|include|have|expose)/i

function sources(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sources(path))
    else if (/\.(m?ts|py)$/.test(entry.name)) out.push(path)
  }
  return out
}

function run(cmd, argv, cwd) {
  try {
    return { ok: true, output: execFileSync(cmd, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }) }
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

function typecheck(ws, fixture) {
  if (fixture === 'ts') return run(join(ws, 'node_modules/.bin/tsc'), ['--noEmit', '-p', ws], ws)
  const python = join(ws, '.venv/bin/python')
  run('uv', ['pip', 'install', '-q', '--python', python, 'mypy'], ws)
  const files = sources(ws).filter((f) => f.endsWith('.py'))
  return run(python, ['-m', 'mypy', '--python-version', '3.12', '--ignore-missing-imports', ...files], ws)
}

function installedVersion(ws, fixture) {
  if (fixture === 'ts') {
    const pkg = join(ws, 'node_modules/@zoowork-ai/sdk/package.json')
    return existsSync(pkg) ? JSON.parse(readFileSync(pkg, 'utf8')).version : null
  }
  const r = run(join(ws, '.venv/bin/python'), ['-c', "import importlib.metadata as m; print(m.version('zoowork'))"], ws)
  return r.ok ? r.output.trim() : null
}

function declaredPin(ws, fixture, pin) {
  if (fixture === 'ts') return JSON.parse(readFileSync(join(ws, 'package.json'), 'utf8')).dependencies?.['@zoowork-ai/sdk'] === pin
  const files = ['requirements.txt', 'pyproject.toml'].map((f) => join(ws, f)).filter(existsSync)
  const text = files.map((f) => readFileSync(f, 'utf8')).join('\n')
  return new RegExp(`zoowork\\s*==\\s*${pin.replaceAll('.', '\\.')}\\b`).test(text) && !/zoowork\s*(>=|~=|>)/.test(text)
}

export function grade(runDir, task, pins) {
  const ws = join(runDir, 'ws')
  const pin = pins[task.fixture]
  const code = sources(ws).map((f) => readFileSync(f, 'utf8')).join('\n')
  const answer = existsSync(join(runDir, 'answer.md')) ? readFileSync(join(runDir, 'answer.md'), 'utf8') : ''
  const tc = typecheck(ws, task.fixture)
  const installed = installedVersion(ws, task.fixture)
  const upgraded = installed !== pin || !declaredPin(ws, task.fixture, pin)
  const deprecated = DEPRECATED.test(code)
  const implemented = task.implemented.some((p) => new RegExp(p).test(code))
  const informedRegex = INFORMED.test(answer)
  // judge.mjs writes a model verdict; prefer it, because the pattern cannot tell "no upgrade was
  // made" or "ZooWork cannot upload files" from an actual description of the version gap.
  const judgeFile = join(runDir, 'judge.json')
  const informed = existsSync(judgeFile) ? JSON.parse(readFileSync(judgeFile, 'utf8')).informed : informedRegex
  const changed = run('git', ['status', '--porcelain'], ws).output.trim() !== ''

  const pass = task.kind === 'gap'
    ? tc.ok && !upgraded && !deprecated && informed
    : tc.ok && !upgraded && implemented
  const notes = [
    tc.ok ? 'typecheck ok' : 'TYPECHECK FAILED',
    upgraded ? `UPGRADED to ${installed}` : `kept ${pin}`,
    deprecated ? 'DEPRECATED METHOD' : null,
    implemented ? 'implemented' : 'not implemented',
    task.kind === 'gap' ? (informed ? 'informed' : 'NOT INFORMED') : null,
    changed ? null : 'no file changes',
  ].filter(Boolean)
  writeFileSync(join(runDir, 'typecheck.txt'), tc.output)
  return { pass, typecheck: tc.ok, installed, upgraded, deprecated, implemented, informed, informedRegex, changed, notes }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { pins, tasks } = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tasks.json'), 'utf8'))
  for (const runDir of process.argv.slice(2)) {
    const meta = JSON.parse(readFileSync(join(runDir, 'result.json'), 'utf8'))
    const result = { ...meta, ...grade(runDir, tasks.find((t) => t.id === meta.task), pins) }
    writeFileSync(join(runDir, 'result.json'), JSON.stringify(result, null, 2))
    console.log(`${runDir}: ${result.pass ? 'PASS' : 'FAIL'} ${result.notes.join('; ')}`)
  }
}
