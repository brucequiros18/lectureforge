// Accessibility crawl with axe-core across the app's key states.
// Usage: node docs/qa-axe.mjs   (dev server on :5173 required)
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const axeSrc = readFileSync(join(here, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
const wav = join(here, 'assets', 'Lecture-Recording-01.wav')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

async function audit(label) {
  await page.evaluate((src) => {
    window.axe = undefined
    return new Promise((resolve) => {
      const s = document.createElement('script')
      s.textContent = src
      document.head.appendChild(s)
      resolve(undefined)
    })
  }, axeSrc)
  const res = await page.evaluate(() =>
    window.axe.run(document, { resultTypes: ['violations'] }),
  )
  const vs = res.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    help: v.help,
    sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }))
  console.log(`\n=== ${label}: ${vs.length} violation kinds ===`)
  for (const v of vs) {
    console.log(`[${v.impact}] ${v.id} ×${v.nodes} — ${v.help}`)
    for (const t of v.sample) console.log('   ', t)
  }
  return vs
}

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForSelector('#file-input', { timeout: 20000 })
  await page.waitForTimeout(300)
  const a = await audit('dropzone')

  await page.setInputFiles('#file-input', wav)
  await page.waitForFunction(() => /\d+ gaps? ·/.test(document.body.innerText), { timeout: 120000 })
  await page.waitForTimeout(500)
  const b = await audit('ready / waveform')

  await page.locator('button[aria-label="Recent exports"]').click()
  await page.waitForTimeout(400)
  const c = await audit('history drawer')
  await page.locator('button[aria-label="Close history"]').click()

  await page.keyboard.press('?')
  await page.waitForTimeout(300)
  const d = await audit('shortcuts modal')

  const total = [...a, ...b, ...c, ...d].filter((v) => v.impact === 'serious' || v.impact === 'critical')
  console.log(`\nTOTAL serious/critical: ${total.length}`)
  if (total.length === 0) console.log('AXE CLEAN (serious/critical)')
} catch (err) {
  console.error('QA FAILED:', err.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
