// Documentation screenshots + real timing measurements via Playwright.
// Requires: dev server on :5173 and docs/assets/Lecture-Recording-01.wav.
// Usage: node docs/capture.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const assets = join(here, 'assets')
mkdirSync(assets, { recursive: true })
const wav = join(assets, 'Lecture-Recording-01.wav')

const shots = {
  dropzone: join(assets, 'shot-1-dropzone.png'),
  waveform: join(assets, 'shot-2-waveform-gaps.png'),
  gapReview: join(assets, 'shot-3-gap-review.png'),
  exporting: join(assets, 'shot-4-export-progress.png'),
  history: join(assets, 'shot-5-history.png'),
}

const timings = { fileMB: 105.5 }

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForSelector('#file-input', { timeout: 20000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: shots.dropzone })
  console.log('shot 1 ok (dropzone)')

  // ── load + analyze, measure load→ready ──────────────────────────────
  const t0 = Date.now()
  await page.setInputFiles('#file-input', wav)
  await page.waitForFunction(
    () => /\d+ gaps? ·/.test(document.body.innerText),
    { timeout: 180000 },
  )
  timings.loadToReadyMs = Date.now() - t0
  await page.waitForTimeout(700) // let waveform paint settle
  await page.screenshot({ path: shots.waveform })
  console.log(`shot 2 ok (waveform) — load→ready ${timings.loadToReadyMs} ms`)

  // read stats text + gap count
  timings.statsText = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span')].map((s) => s.textContent ?? '')
    return spans.find((t) => t.includes('gaps ·')) ?? ''
  })
  const gapCount = parseInt(timings.statsText, 10) || 0
  timings.gapCount = gapCount
  console.log('stats:', timings.statsText)

  // ── keep one gap via the review list ────────────────────────────────
  const rows = page.locator('[aria-label="Detected gaps review"] ul li button')
  await rows.first().waitFor({ timeout: 15000 })
  await rows.nth(Math.min(2, gapCount - 1)).click()
  await page.waitForTimeout(350)
  await page.screenshot({ path: shots.gapReview })
  timings.keptGaps = 1
  console.log('shot 3 ok (gap review, one gap kept)')

  // ── speed 1.5x + export, measure export time ────────────────────────
  await page.locator('[aria-label="Speed presets"] button', { hasText: '1.5×' }).click()
  await page.waitForTimeout(200)

  const dlPromise = page.waitForEvent('download', { timeout: 240000 })
  const tExp = Date.now()
  await page.locator('button', { hasText: 'Export MP3' }).click()
  await page.waitForTimeout(900) // mid-progress
  await page.screenshot({ path: shots.exporting })
  console.log('shot 4 ok (export progress)')
  const dl = await dlPromise
  timings.exportMs = Date.now() - tExp
  const outPath = join(assets, 'exported-output.mp3')
  await dl.saveAs(outPath)
  timings.outputFile = dl.suggestedFilename()
  console.log(`export done in ${timings.exportMs} ms → ${timings.outputFile}`)

  // ── history drawer ───────────────────────────────────────────────────
  await page.waitForTimeout(900) // let the success toast land
  await page.locator('button[aria-label="Recent exports"]').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: shots.history })
  console.log('shot 5 ok (history)')

  writeFileSync(join(here, 'timings.json'), JSON.stringify(timings, null, 2))
  console.log('timings saved:', JSON.stringify(timings))
} catch (err) {
  console.error('CAPTURE FAILED:', err.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
