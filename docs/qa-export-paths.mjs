// Verifies the export path with normalize ON (the 3rd phase combination).
import { chromium } from 'playwright'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const wav = join(here, 'assets', 'Lecture-Recording-Short.wav')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForSelector('#file-input', { timeout: 20000 })
  await page.setInputFiles('#file-input', wav)
  await page.waitForFunction(() => /\d+ gaps? ·/.test(document.body.innerText), { timeout: 120000 })
  await page.getByText('Normalize').click()
  await page.waitForTimeout(300)
  await page.selectOption('[aria-label="Output format"]', 'wav')
  await page.waitForTimeout(200)
  const dlPromise = page.waitForEvent('download', { timeout: 180000 })
  await page.locator('button', { hasText: 'Export WAV' }).click()
  const download = await dlPromise
  console.log('normalize+wav export OK →', download.suggestedFilename())
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}
