// Baseline + after screenshots of the current UI.
// Usage: node docs/capture-ui.mjs after
import { chromium } from 'playwright'
import { mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const tag = process.argv[2] ?? 'base'
const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'ui-shots', tag)
mkdirSync(out, { recursive: true })
const wav = join(here, 'assets', 'Lecture-2min.wav')
if (!existsSync(wav)) {
  console.error('fixture wav missing — run: node docs/fixture.mjs 2 Lecture-2min.wav')
  process.exit(1)
}

const browser = await chromium.launch()

// ── desktop 1440×900 ─────────────────────────────────────────────────
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForSelector('#file-input')
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, 'd1-idle.png') })
console.log('d1-idle')

await page.setInputFiles('#file-input', wav)
await page.waitForFunction(
  () => /gaps? ·/.test(document.body.innerText),
  { timeout: 120000 },
)
await page.waitForTimeout(800)
await page.screenshot({ path: join(out, 'd2-ready.png') })
console.log('d2-ready')

// shortcuts modal
await page.keyboard.press('Backquote') // ensure not in an input
await page.locator('button[aria-label="Keyboard shortcuts"]').click()
await page.waitForTimeout(300)
await page.screenshot({ path: join(out, 'd3-shortcuts.png') })
console.log('d3-shortcuts')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// mobile 390×844
const m = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
await m.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await m.waitForSelector('#file-input')
await m.waitForTimeout(400)
await m.screenshot({ path: join(out, 'm1-idle.png') })
console.log('m1-idle')

await m.setInputFiles('#file-input', wav)
await m.waitForFunction(
  () => /gaps? ·/.test(document.body.innerText),
  { timeout: 120000 },
)
await m.waitForTimeout(800)
await m.screenshot({ path: join(out, 'm2-ready-full.png') })
await m.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await m.waitForTimeout(300)
await m.screenshot({ path: join(out, 'm3-ready-bottom.png') })
console.log('m2/m3 mobile ready')

await browser.close()
console.log('done →', out)
