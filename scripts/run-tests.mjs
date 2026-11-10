// Discovers *.test.ts under src/ and runs each through the node test runner.
import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = 'src'
const found = []

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walk(p)
    else if (/\.test\.ts$/.test(entry.name)) found.push(p)
  }
}

walk(root)

if (found.length === 0) {
  console.error('no *.test.ts found')
  process.exit(1)
}

let failed = false
for (const f of found) {
  console.log(`\n=== ${relative('.', f)} ===`)
  const res = spawnSync(process.execPath, ['--test', '--test-reporter=spec', f], {
    stdio: 'inherit',
  })
  if (res.status !== 0) failed = true
}

process.exitCode = failed ? 1 : 0
