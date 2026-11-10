// Builds the LectureForge presentation deck (7 slides, 16:9).
// Palette = the product's own: near-black panels + amber accent.
import pptxgen from 'pptxgenjs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const A = (n) => join(here, 'assets', n)

// palette (no # — pptxgenjs rule)
const BG = '0B0D12'
const PANEL_LT = 'F2F4F8'
const INK = '1A1D26'
const DIM = '5E6574'
const AMBER = 'FFB224'
const AMBER_DK = 'B97A10'
const WHITE = 'FFFFFF'
const OK = '2FA574'

const pres = new pptxgen()
pres.layout = 'LAYOUT_16x9' // 10 x 5.625 in

// ── motif: 5-bar waveform mark ──────────────────────────────────────────
function wave(slide, x, y, h, mainColor, altColor) {
  const hs = [0.42, 0.78, 1.0, 0.6, 0.32].map((k) => k * h)
  hs.forEach((bh, i) => {
    slide.addShape('roundRect', {
      x: x + i * 0.17,
      y: y + (h - bh) / 2,
      w: 0.1,
      h: bh,
      rectRadius: 0.05,
      fill: { color: i === 2 ? mainColor : altColor },
      line: { type: 'none' },
    })
  })
}

// ── 1 · title (dark) ────────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: BG }
  wave(s, 0.62, 0.62, 0.52, AMBER, '3A4356')

  s.addText('LectureForge', {
    x: 0.6, y: 1.62, w: 4.4, h: 0.85,
    fontFace: 'Calibri', fontSize: 44, bold: true, color: WHITE, margin: 0,
  })
  s.addText('Cut the silence. Keep the lecture.', {
    x: 0.6, y: 2.52, w: 4.4, h: 0.4,
    fontFace: 'Calibri', fontSize: 18, color: AMBER, margin: 0,
  })
  s.addText(
    'A browser app that removes dead air from class recordings,\nspeeds them up without a chipmunk voice, and exports MP3 —\nwith no upload, no account, and no installation.',
    {
      x: 0.6, y: 3.1, w: 4.35, h: 1.1,
      fontFace: 'Calibri', fontSize: 12.5, color: 'C7CDD9', margin: 0, lineSpacingMultiple: 1.25,
    },
  )
  s.addText('Nash Bruce V. Quiros  ·  BSCS-3  ·  Multimedia  ·  November 4, 2026', {
    x: 0.6, y: 4.95, w: 6.5, h: 0.35,
    fontFace: 'Calibri', fontSize: 11, color: '8A93A6', margin: 0,
  })
  // product screenshot, right half-bleed
  s.addImage({ path: A('shot-2-waveform-gaps.png'), x: 5.25, y: 1.28, w: 4.75, h: 2.97 })
  s.addText('20 silent gaps found automatically in a 10-minute lecture', {
    x: 5.25, y: 4.34, w: 4.75, h: 0.3,
    fontFace: 'Calibri', fontSize: 10.5, italic: true, color: '8A93A6', align: 'center', margin: 0,
  })
  s.addNotes(
    'Good day! This is LectureForge, my Multimedia final project: a web app that makes lecture recordings shorter. Everything runs inside the browser — no uploads, no accounts.',
  )
}

// ── 2 · problem (light) ─────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: WHITE }
  s.addText('One hour of lecture. Up to 15 minutes of dead air.', {
    x: 0.6, y: 0.45, w: 8.8, h: 0.6,
    fontFace: 'Calibri', fontSize: 28, bold: true, color: INK, margin: 0,
  })
  s.addText(
    'Silence while a class settles, the teacher thinks, or papers shuffle. Hand-cutting it in an editor means finding every silent part yourself.',
    {
      x: 0.6, y: 1.12, w: 8.8, h: 0.55,
      fontFace: 'Calibri', fontSize: 13, color: DIM, margin: 0,
    },
  )
  const cards = [
    ['10–15 min', 'of silence in a typical 1-hour class recording'],
    ['20+ edits', 'to select and delete each gap by hand'],
    ['15+ min', 'of careful zooming, selecting, deleting, exporting'],
  ]
  cards.forEach(([big, small], i) => {
    const x = 0.6 + i * 3.05
    s.addShape('roundRect', {
      x, y: 1.95, w: 2.75, h: 2.1, rectRadius: 0.12,
      fill: { color: PANEL_LT }, line: { type: 'none' },
    })
    s.addText(big, {
      x: x + 0.25, y: 2.25, w: 2.25, h: 0.75,
      fontFace: 'Calibri', fontSize: 32, bold: true, color: AMBER_DK, margin: 0,
    })
    s.addText(small, {
      x: x + 0.25, y: 3.05, w: 2.25, h: 0.85,
      fontFace: 'Calibri', fontSize: 12, color: INK, margin: 0, lineSpacingMultiple: 1.15,
    })
  })
  s.addText('Who it helps: students reviewing recorded lectures, and teachers sharing class recordings on slow connections.', {
    x: 0.6, y: 4.55, w: 8.8, h: 0.5,
    fontFace: 'Calibri', fontSize: 12.5, italic: true, color: DIM, margin: 0,
  })
  s.addNotes('The problem: recorded classes are full of dead air. Removing it by hand is slow and repetitive — an hour of audio can hide twenty silences.')
}

// ── 3 · how it works (light) ────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: WHITE }
  s.addText('How it works', {
    x: 0.6, y: 0.45, w: 8.8, h: 0.6,
    fontFace: 'Calibri', fontSize: 28, bold: true, color: INK, margin: 0,
  })
  s.addImage({ path: A('figure-1-flow.png'), x: 1.15, y: 1.25, w: 7.7, h: 3.32 })
  s.addText('Loudness is measured in small frames; silent gaps become visible cuts the user reviews before export.', {
    x: 0.6, y: 4.85, w: 8.8, h: 0.4,
    fontFace: 'Calibri', fontSize: 11.5, italic: true, color: DIM, align: 'center', margin: 0,
  })
  s.addNotes(
    'Input: any audio file or a mic recording. Process: decode, detect silence, review, cut, optional pitch-preserving speed-up, encode. Output: a shorter MP3 or WAV saved to the device.',
  )
}

// ── 4 · inside the app (light) ──────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: WHITE }
  s.addText('Every cut visible — every cut reviewable', {
    x: 0.6, y: 0.45, w: 8.8, h: 0.6,
    fontFace: 'Calibri', fontSize: 28, bold: true, color: INK, margin: 0,
  })
  s.addImage({ path: A('shot-2-waveform-gaps.png'), x: 0.55, y: 1.3, w: 4.32, h: 2.7 })
  s.addImage({ path: A('shot-3-gap-review.png'), x: 5.13, y: 1.3, w: 4.32, h: 2.7 })
  s.addText('Gaps are marked red on the waveform — found in 2.3 seconds', {
    x: 0.55, y: 4.08, w: 4.32, h: 0.55,
    fontFace: 'Calibri', fontSize: 11, color: DIM, align: 'center', margin: 0,
  })
  s.addText('One click keeps a pause; the estimate updates instantly', {
    x: 5.13, y: 4.08, w: 4.32, h: 0.55,
    fontFace: 'Calibri', fontSize: 11, color: DIM, align: 'center', margin: 0,
  })
  s.addText('Plus: batch queue, microphone recording, offline install (PWA), keyboard shortcuts.', {
    x: 0.6, y: 4.85, w: 8.8, h: 0.4,
    fontFace: 'Calibri', fontSize: 12, italic: true, color: DIM, align: 'center', margin: 0,
  })
  s.addNotes(
    'Detection is fast — 2.3 seconds for a 105-megabyte file. The gap list gives the user the final say: click a gap to keep it, and the export estimate updates right away.',
  )
}

// ── 5 · tested (light) ──────────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: WHITE }
  s.addText('Tested end to end', {
    x: 0.6, y: 0.45, w: 8.8, h: 0.6,
    fontFace: 'Calibri', fontSize: 28, bold: true, color: INK, margin: 0,
  })
  s.addText('All five manual tests passed on a 10.4-minute sample lecture (105 MB, 20 inserted silences):', {
    x: 0.6, y: 1.12, w: 8.8, h: 0.45,
    fontFace: 'Calibri', fontSize: 13, color: DIM, margin: 0,
  })
  const stats = [
    ['2.3 s', 'to load and analyze the file'],
    ['20 / 20', 'silent gaps detected'],
    ['5:05', 'exact export length'],
    ['25 / 25', 'automated engine tests pass'],
  ]
  stats.forEach(([big, small], i) => {
    const x = 0.6 + i * 2.32
    s.addText(big, {
      x, y: 1.85, w: 2.1, h: 0.8,
      fontFace: 'Calibri', fontSize: 36, bold: true, color: AMBER_DK, margin: 0,
    })
    s.addText(small, {
      x, y: 2.68, w: 2.0, h: 0.75,
      fontFace: 'Calibri', fontSize: 11.5, color: INK, margin: 0, lineSpacingMultiple: 1.12,
    })
  })
  s.addText(
    [
      { text: 'Keeping one gap in review updated the plan from 20 cuts to 19 (10:27 → 07:38) — and the export honored it.', options: { bullet: true, breakLine: true } },
      { text: 'MP3 at 1.5× speed finished in 20.5 s: valid MP3, duration exactly 5:05, natural pitch.', options: { bullet: true, breakLine: true } },
      { text: 'Accessibility audit (axe-core): zero serious findings across all app states; loudness leveling verified.', options: { bullet: true } },
    ],
    {
      x: 0.6, y: 3.7, w: 8.8, h: 1.4,
      fontFace: 'Calibri', fontSize: 12.5, color: INK, paraSpaceAfter: 6, margin: 0,
    },
  )
  s.addNotes(
    'I measured everything on a ten-minute sample: loading, detection, the keep-a-gap review, and the export duration — plus 22 automated tests for the audio engine itself.',
  )
}

// ── 6 · comparison (light) ──────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: WHITE }
  s.addText('Same task, two ways', {
    x: 0.6, y: 0.45, w: 8.8, h: 0.6,
    fontFace: 'Calibri', fontSize: 28, bold: true, color: INK, margin: 0,
  })
  s.addText('Cut the silence from the same 10.4-minute lecture', {
    x: 0.6, y: 1.1, w: 8.8, h: 0.4,
    fontFace: 'Calibri', fontSize: 13, color: DIM, margin: 0,
  })
  // LectureForge card
  s.addShape('roundRect', { x: 0.6, y: 1.7, w: 4.25, h: 3.0, rectRadius: 0.12, fill: { color: 'FDF3DC' }, line: { type: 'none' } })
  s.addText('LectureForge', { x: 0.9, y: 1.95, w: 3.6, h: 0.4, fontFace: 'Calibri', fontSize: 17, bold: true, color: AMBER_DK, margin: 0 })
  s.addText('3 clicks  ·  ~23 seconds', { x: 0.9, y: 2.38, w: 3.6, h: 0.4, fontFace: 'Calibri', fontSize: 20, bold: true, color: INK, margin: 0 })
  s.addText(
    [
      { text: 'Drop the file (2.3 s analysis)', options: { bullet: true, breakLine: true } },
      { text: 'Review gaps — optional', options: { bullet: true, breakLine: true } },
      { text: 'Export MP3 (20.5 s)', options: { bullet: true } },
    ],
    { x: 0.9, y: 2.95, w: 3.6, h: 1.5, fontFace: 'Calibri', fontSize: 12.5, color: INK, paraSpaceAfter: 6, margin: 0 },
  )
  // Audacity card
  s.addShape('roundRect', { x: 5.15, y: 1.7, w: 4.25, h: 3.0, rectRadius: 0.12, fill: { color: PANEL_LT }, line: { type: 'none' } })
  s.addText('Audacity (manual way)', { x: 5.45, y: 1.95, w: 3.6, h: 0.4, fontFace: 'Calibri', fontSize: 17, bold: true, color: DIM, margin: 0 })
  s.addText('60+ interactions  ·  15+ minutes', { x: 5.45, y: 2.38, w: 3.7, h: 0.4, fontFace: 'Calibri', fontSize: 20, bold: true, color: INK, margin: 0 })
  s.addText(
    [
      { text: 'Zoom in, hunt each silence by eye and ear', options: { bullet: true, breakLine: true } },
      { text: 'Select + delete — 20 times over', options: { bullet: true, breakLine: true } },
      { text: 'One mistake can clip a word', options: { bullet: true } },
    ],
    { x: 5.45, y: 2.95, w: 3.7, h: 1.5, fontFace: 'Calibri', fontSize: 12.5, color: INK, paraSpaceAfter: 6, margin: 0 },
  )
  s.addText('Measured: LectureForge timings are from the tests; the Audacity path is the documented manual workflow, estimated.', {
    x: 0.6, y: 4.95, w: 8.8, h: 0.4,
    fontFace: 'Calibri', fontSize: 10.5, italic: true, color: DIM, margin: 0,
  })
  s.addNotes(
    'Test five compares the same task: three clicks and about 23 seconds with LectureForge, versus 60-plus interactions and 15-plus minutes doing it manually in Audacity.',
  )
}

// ── 7 · conclusion (dark) ───────────────────────────────────────────────
{
  const s = pres.addSlide()
  s.background = { color: BG }
  wave(s, 8.5, 0.55, 0.52, AMBER, '3A4356')
  s.addText('Conclusion', {
    x: 0.6, y: 0.5, w: 7.5, h: 0.65,
    fontFace: 'Calibri', fontSize: 30, bold: true, color: WHITE, margin: 0,
  })
  const cols = [
    ['What works', OK, [
      'All 5 manual tests passed',
      '20-min lecture → 5:05 in ~23 s',
      'Loudness leveling + mobile layout',
      'Fully offline & private',
    ]],
    ['Limits', '8A93A6', [
      'Audio only — no video files',
      'Recorder needs mic permission',
      'Files >220 MB at lower rate',
      'Safari 15+ only',
    ]],
    ['Next', AMBER, [
      'Video soundtrack support',
      'Chapter markers in exports',
      'Filipino interface',
      'iOS Safari polish',
    ]],
  ]
  cols.forEach(([title, color, items], i) => {
    const x = 0.6 + i * 3.05
    s.addText(title, {
      x, y: 1.5, w: 2.75, h: 0.4,
      fontFace: 'Calibri', fontSize: 15, bold: true, color, margin: 0,
    })
    s.addText(
      items.map((t, j) => ({
        text: t,
        options: { bullet: j === items.length - 1 ? { code: '2022' } : { code: '2022' }, breakLine: j < items.length - 1 },
      })),
      {
        x, y: 2.0, w: 2.75, h: 2.4,
        fontFace: 'Calibri', fontSize: 12.5, color: 'D6DBE6', paraSpaceAfter: 8, margin: 0,
      },
    )
  })
  s.addText('LectureForge  ·  Nash Bruce V. Quiros  ·  Tangub City Global College  ·  BSCS-3', {
    x: 0.6, y: 5.0, w: 8.8, h: 0.35,
    fontFace: 'Calibri', fontSize: 11, color: '8A93A6', margin: 0,
  })
  s.addNotes(
    'To conclude: the core promise works — silence out, speed up, MP3 out, all offline. The limits are known, and the next steps are clear. Thank you!',
  )
}

await pres.writeFile({ fileName: join(here, 'LectureForge_Presentation.pptx') })
console.log('deck written')
