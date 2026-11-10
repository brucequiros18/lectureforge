// Records the product demo video with burned-in step captions.
// Output: docs/demo/lectureforge-demo.webm (+ narration script alongside).
// Usage: node docs/capture-video.mjs   (dev server on :5173 required)
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const demoDir = join(here, 'demo')
mkdirSync(demoDir, { recursive: true })
const wav = join(here, 'assets', 'Lecture-Recording-Short.wav')

// clean old video parts
for (const f of readdirSync(demoDir)) {
  if (f.endsWith('.webm')) rmSync(join(demoDir, f))
}

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: demoDir, size: { width: 1280, height: 720 } },
})
const page = await ctx.newPage()

const t0 = Date.now()
const t = () => Math.round((Date.now() - t0) / 1000)
const timeline = []

async function cap(text, holdMs = 3500) {
  await page.evaluate((txt) => {
    let el = document.getElementById('demo-cap')
    if (!el) {
      el = document.createElement('div')
      el.id = 'demo-cap'
      el.style.cssText =
        'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:9999;' +
        'background:rgba(11,13,18,0.92);color:#ffb224;font:600 21px Segoe UI,sans-serif;' +
        'padding:10px 22px;border-radius:12px;border:1px solid rgba(255,178,36,0.4);' +
        'box-shadow:0 4px 18px rgba(0,0,0,0.5);transition:opacity 300ms;pointer-events:none'
      document.body.appendChild(el)
    }
    el.textContent = txt
    el.style.opacity = '1'
  }, text)
  timeline.push({ at: t(), caption: text })
  await page.waitForTimeout(holdMs)
  await page.evaluate(() => {
    const el = document.getElementById('demo-cap')
    if (el) el.style.opacity = '0'
  })
  await page.waitForTimeout(350)
}

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
  await page.waitForSelector('#file-input', { timeout: 20000 })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('#file-input', { timeout: 20000 })
  await page.waitForTimeout(800)

  await cap('LectureForge — cut the silence out of lecture recordings', 4000)
  await cap('Step 1 · Drop a lecture recording — nothing is uploaded', 2500)

  await page.setInputFiles('#file-input', wav)
  await page.waitForFunction(() => /\d+ gaps? ·/.test(document.body.innerText), { timeout: 120000 })
  await page.waitForTimeout(900)
  await cap('Silent gaps are detected automatically', 5000)

  await cap('Step 2 · Review each gap — keep a pause with one click', 2000)
  await page.locator('[aria-label="Detected gaps review"] ul li button').nth(1).click()
  await page.waitForTimeout(1200)
  await page.locator('[aria-label="Detected gaps review"] ul li button').nth(1).hover()
  await page.waitForTimeout(2600)

  await cap('Step 3 · Speed it up — pitch stays natural', 1800)
  await page.locator('[aria-label="Speed presets"] button', { hasText: '1.5×' }).click()
  await page.waitForTimeout(500)
  await page.mouse.wheel(0, -400)
  await page.waitForTimeout(2800)

  await cap('Step 4 · Export MP3 — everything runs on this device', 2200)
  const dlPromise = page.waitForEvent('download', { timeout: 180000 })
  await page.locator('button', { hasText: 'Export MP3' }).click()
  await page.waitForTimeout(4500)
  const dl = await dlPromise
  const name = dl.suggestedFilename()
  await dl.saveAs(join(demoDir, name))

  await page.waitForTimeout(1100)
  await cap('Done — saved to your device, shorter and ready to share', 4500)

  await page.locator('button[aria-label="Recent exports"]').click()
  await page.waitForTimeout(600)
  await cap('LectureForge — offline, private, student-friendly', 4000)

  await ctx.close() // flushes the video file
  const video = page.video()
  const vpath = video ? await video.path() : null
  if (vpath) {
    const final = join(demoDir, 'lectureforge-demo.webm')
    try {
      rmSync(final)
    } catch {
      /* not present yet */
    }
    await page.video()?.saveAs(final).catch(() => undefined)
  }

  const srt = timeline
    .map((x, i) => {
      const start = x.at
      const end = timeline[i + 1]?.at ?? start + 4
      const fmt = (s) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},000`
      return `${i + 1}\n${fmt(start)} --> ${fmt(end)}\n${x.caption}\n`
    })
    .join('\n')
  writeFileSync(join(demoDir, 'captions.srt'), srt)
  console.log('video saved, captions.srt written, exported file:', name)
} catch (err) {
  console.error('VIDEO FAILED:', err.message)
  await ctx.close()
  process.exitCode = 1
} finally {
  await browser.close()
}
