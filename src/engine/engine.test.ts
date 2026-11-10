/**
 * Engine unit tests — pure math, encoders, stretch. Run via:
 *   npm test   (node --test, TS type-stripping)
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  detectGaps,
  buildKeepSegments,
  secToFrame,
  gapAt,
  refineGaps,
  enabledGaps,
  gapKeyOf,
  addGapRange,
  removeGapByKey,
  normalizeRanges,
  type Range,
} from './silence.ts'
import { spliceInto, spliceLength, type Seg } from './splicer.ts'
import { stretchPair, stretchPairAsync } from './stretch.ts'
import { encodeWav, encodeMp3, parseWavMeta } from './encode.ts'
import { measureRmsDb, normalizeGainDb, normalizeLoudness, NORMALIZE_TARGET_DB } from './normalize.ts'
import { buildExportName } from './format.ts'
import {
  analysisLengthFor,
  decimateChunk,
  frameCountFor,
  meterFrames,
  peakChunk,
  toDb,
  initPeakArrays,
  finalizePeaks,
  FRAME_SEC,
} from './analysis.ts'

/* ── fixture: synthetic "lecture" mono at native rate ──────────────────── */

interface Part {
  speech: number
  gap: number
}

function buildLecture(rate: number, parts: Part[]): Float32Array {
  let frames = 0
  for (const p of parts) frames += Math.round(p.speech * rate) + Math.round(p.gap * rate)
  const out = new Float32Array(frames)
  let pos = 0
  for (const p of parts) {
    const speechLen = Math.round(p.speech * rate)
    for (let i = 0; i < speechLen; i++) {
      out[pos + i] = ((i * 7919) % 65535) / 65535 * 0.4 - 0.2 // pseudo speech
    }
    pos += speechLen
    if (p.gap > 0) pos += Math.round(p.gap * rate) // stays zero = digital silence
  }
  return out
}

const TEST_RATE = 44100

/* ── silence detection ─────────────────────────────────────────────────── */

test('detectGaps finds the synthetic gaps and skips short ones', () => {
  // frame track: 20 speech / 8 silent / 22 speech / 3 silent / 30 speech
  const rmsDb = new Float32Array(20 + 8 + 22 + 3 + 30)
  for (let i = 0; i < rmsDb.length; i++) rmsDb[i] = -85
  const speechZones: [number, number][] = [[0, 20],[28, 50],[53, 83]]
  for (const [a, b] of speechZones) for (let i = a; i < b; i++) rmsDb[i] = -38

  const params = { thresholdDb: -50, minGapSec: 0.6, padSec: 0.15 }
  const gaps = detectGaps(rmsDb, FRAME_SEC, params)
  assert.equal(gaps.length, 1, `expected 1 gap, got ${JSON.stringify(gaps)}`)
  const [a, b] = gaps[0]
  // run spans frames 20..27; pad=1 frame each side → cut 21..27
  assert.ok(Math.abs(a - 21 * FRAME_SEC) < 1e-9, `start ${a}`)
  assert.ok(Math.abs(b - 27 * FRAME_SEC) < 1e-9, `end ${b}`)
})

test('detectGaps ignores runs too short after padding', () => {
  const rmsDb = new Float32Array(40).fill(-38)
  for (let i = 18; i < 21; i++) rmsDb[i] = -85 // 3 silent frames = 0.375s
  const gaps = detectGaps(rmsDb, FRAME_SEC, { thresholdDb: -50, minGapSec: 0.6, padSec: 0.15 })
  assert.equal(gaps.length, 0)
})

test('detectGaps threshold sensitivity', () => {
  const rmsDb = new Float32Array(20 + 10 + 20).fill(-42) // quiet speech
  for (let i = 20; i < 30; i++) rmsDb[i] = -90 // digital silence
  const strict = detectGaps(rmsDb, FRAME_SEC, { thresholdDb: -46, minGapSec: 0.5, padSec: 0.12 })
  const loose = detectGaps(rmsDb, FRAME_SEC, { thresholdDb: -30, minGapSec: 0.5, padSec: 0.12 })
  assert.equal(strict.length, 1)
  // -30 makes even the speech quieter than the threshold → nothing may be cut
  assert.equal(loose.length, 0)
})

/* ── keep segment plan ─────────────────────────────────────────────────── */

test('buildKeepSegments inverts gaps and drops empty edges', () => {
  const keep = buildKeepSegments([[1, 2], [3, 4]], 6)
  assert.deepEqual(keep, [[0, 1], [2, 3], [4, 6]])
})

test('buildKeepSegments handles gap touching total end', () => {
  const keep = buildKeepSegments([[2, 5]], 5)
  assert.deepEqual(keep, [[0, 2]])
})

/* ── splice roundtrip: detect → plan → splice ──────────────────────────── */

test('splice pipeline output length matches kept speech exactly', () => {
  // 2s speech, 1s gap, 3s speech — pad 0.15 both sides + 0.125s frame
  // quantization → the removable cut is ~0.6-0.8s of the 1s run.
  const mono = buildLecture(TEST_RATE, [{ speech: 2, gap: 0 }, { speech: 0, gap: 1 }, { speech: 3, gap: 0 }])
  const gaps = detectSilenceFromMono(mono, TEST_RATE)
  assert.equal(gaps.length, 1, '1s digital silence must yield exactly one gap')
  const removed = gaps[0][1] - gaps[0][0]
  assert.ok(removed >= 0.55 && removed <= 0.85, `removed ${removed}`)
  const keep = buildKeepSegments(
    gaps.map(([a, b]) => [a, b] as [number, number]),
    mono.length / TEST_RATE,
  )
  const segs: Seg[] = keep.map(([a, b]) => ({
    start: secToFrame(a, mono.length / TEST_RATE, TEST_RATE),
    end: secToFrame(b, mono.length / TEST_RATE, TEST_RATE),
  }))
  assert.equal(spliceLength(segs), mono.length - Math.round(removed * TEST_RATE))
  const out = new Float32Array(spliceLength(segs))
  spliceInto(mono, segs, out)
  // boundaries: out[0] is speech-like, tail is the end of the last speech run
  assert.ok(Math.abs(out[0]) > 1e-4)
  const outTail = out[out.length - 1]
  assert.ok(Math.abs(outTail) > 1e-4)
})

/** Mono-based analysis copy of the worker logic (for tests). */
function detectSilenceFromMono(mono: Float32Array, rate: number): [number, number][] {
  const anaLen = analysisLengthFor(mono.length / rate)
  const analysis = new Float32Array(anaLen)
  const fakeL = mono
  const fakeR = mono
  for (let j0 = 0; j0 < anaLen; j0 += 9600) {
    const jc = Math.min(9600, anaLen - j0)
    decimateChunk(fakeL, fakeR, j0, jc, 0, rate, analysis)
  }
  const nFrames = frameCountFor(anaLen)
  const rmsDb = new Float32Array(nFrames)
  meterFrames(analysis, 0, nFrames * 2048, rmsDb, 0)
  const gaps = detectGaps(rmsDb.slice(0, nFrames), FRAME_SEC, {
    thresholdDb: -50,
    minGapSec: 0.6,
    padSec: 0.15,
  })
  return gaps.map(([a, b]) => [a, b] as [number, number])
}

test('full mono pipeline: 1h-equivalent synthetic lecture with 20 gaps', () => {
  const parts: Part[] = []
  for (let i = 0; i < 20; i++) parts.push({ speech: 6.4, gap: 1.2 })
  const rate = 44100
  const mono = buildLecture(rate, parts)
  const gaps = detectSilenceFromMono(mono, rate)
  // 20 inserted gaps of 1.2s survive the 0.6s min-gap rule
  assert.equal(gaps.length, 20, `expected 20 gaps, got ${gaps.length}`)
  const removed = gaps.reduce((s, [a, b]) => s + (b - a), 0)
  // per-gap cut ≈ 1.2 − 2×0.15 − frame quantization ≈ 0.83s
  assert.ok(removed >= 15.5 && removed <= 18.0, `removed ${removed}`)
})

/* ── peaks ─────────────────────────────────────────────────────────────── */

test('peaks finalize covers buckets touched by speech only', () => {
  const { peakMin, peakMax } = initPeakArrays()
  const mono = new Float32Array(2048 * 3) // 3 frames of analysis
  for (let i = 512; i < 1024; i++) mono[i] = 0.5
  const len = mono.length * 20 // pretend longer total so buckets stay coarse
  const done = peakChunk(mono, 0, mono.length, len, peakMin, peakMax, 0)
  const fin = finalizePeaks(peakMin, peakMax)
  assert.ok(done > 0)
  let touched = false
  for (let b = 0; b < peakMin.length; b++) {
    if (fin.peakMax[b] === 0.5) touched = true
    assert.ok(fin.peakMax[b] >= fin.peakMin[b])
  }
  assert.ok(touched)
})

test('toDb floors at -120', () => {
  assert.equal(toDb(0), -120)
  assert.ok(Math.abs(toDb(0.1)) > 19 && Math.abs(toDb(0.1)) < 21)
})

/* ── time-stretch ──────────────────────────────────────────────────────── */

function sineStereo(hz: number, durSec: number, rate: number): [Float32Array, Float32Array] {
  const n = Math.round(durSec * rate)
  const l = new Float32Array(n)
  const r = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    l[i] = 0.6 * Math.sin((2 * Math.PI * hz * i) / rate)
    r[i] = 0.4 * Math.sin((2 * Math.PI * hz * (i + 3)) / rate)
  }
  return [l, r]
}

test('stretchPair at 2x halves duration and preserves amplitude', () => {
  const [l, r] = sineStereo(440, 2, 44100)
  const out = stretchPair(l, r, { speed: 2 })
  const frames = out.length / 2
  const expect = 44100 // 2s at 2x → 1s
  assert.ok(Math.abs(frames - expect) < expect * 0.02, `frames ${frames}`)
  let peak = 0
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
  assert.ok(peak > 0.4 && peak < 1.0, `peak ${peak}`)
})

test('stretchPair at 0.5x doubles duration', () => {
  const [l, r] = sineStereo(220, 1, 44100)
  const out = stretchPair(l, r, { speed: 0.5 })
  const frames = out.length / 2
  assert.ok(Math.abs(frames - 88200) < 88200 * 0.02, `frames ${frames}`)
})

test('stretchPair at 1x passes through', () => {
  const [l, r] = sineStereo(440, 0.5, 44100)
  const out = stretchPair(l, r, { speed: 1 })
  assert.equal(out.length, l.length * 2)
})

test('stretchPairAsync yields same-ish length as sync', async () => {
  const [l, r] = sineStereo(440, 1, 44100)
  const out = await stretchPairAsync(l, r, {
    speed: 1.5,
    onProgress: (_d, t) => assert.ok(t > 0),
    shouldStop: () => false,
  })
  const frames = out.length / 2
  const expect = Math.round(44100 / 1.5)
  assert.ok(Math.abs(frames - expect) < expect * 0.03, `frames ${frames}`)
})

/* ── encoders ──────────────────────────────────────────────────────────── */

const waitFor = (n: number) => new Promise<void>((r) => setTimeout(r, n))

test('encodeWav produces a parseable header + matching data length', async () => {
  const [l, r] = sineStereo(440, 0.6, 44100)
  const blob = await encodeWav({ chans: [l, r], sampleRate: 44100, format: 'wav', onProgress: undefined })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const meta = parseWavMeta(bytes)
  assert.ok(meta, 'wav header not parseable')
  const m = meta!
  assert.equal(m.sampleRate, 44100)
  assert.equal(m.channels, 2)
  assert.equal(m.bitsPerSample, 16)
  assert.equal(m.dataLen, l.length * 2 * 2)
})

test('encodeMp3 emits valid MP3 stream header', async () => {
  const [l, r] = sineStereo(880, 1, 44100)
  await waitFor(0)
  const blob = await encodeMp3({ chans: [l, r], sampleRate: 44100, format: 'mp3', kbps: 128 })
  assert.ok(blob.size > 2000, `mp3 too small: ${blob.size}`)
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  assert.equal(head[0], 0xff, 'mp3 frame sync missing')
})

/* ── misc helpers ──────────────────────────────────────────────────────── */

test('secToFrame clamps', () => {
  const dur = 10
  assert.equal(secToFrame(-1, dur, 100), 0)
  assert.equal(secToFrame(0, dur, 100), 0)
  assert.equal(secToFrame(10, dur, 100), 1000)
  assert.equal(secToFrame(99, dur, 100), 1000)
})

test('gapAt finds covering gap only', () => {
  const gaps: [number, number][] = [[1, 2], [3, 4]]
  assert.ok(gapAt(gaps, 1.5) !== null)
  assert.ok(gapAt(gaps, 2.5) === null)
  assert.ok(gapAt(gaps, 0.5) === null)
})

/* ── sub-frame cut refinement ──────────────────────────────────────────── */

test('refineGaps reclaims frame-grid residue while keeping padSec of silence', () => {
  // mono @16k: pseudo speech [0, 1.0), digital silence [1.0, 3.0)
  const rate = 16000
  const mono = new Float32Array(3 * rate)
  for (let i = 0; i < rate; i++) mono[i] = ((i * 7919) % 65535) / 65535 * 0.4 - 0.2
  // frame-quantized cut: silent frames [8..24), cut [9..23) → [1.125, 2.875]
  const raw: Range[] = [[1.125, 2.875]]
  const refined = refineGaps(raw, mono, rate, -45, 0.05)
  assert.equal(refined.length, 1)
  const [rs, re] = refined[0]
  // start: last loud 8ms window ends at 1.0s (window boundary = sample 16064
  // only in multiples of win — allow ±0.008); padSec of silence must follow.
  assert.ok(rs > 1.0 && rs < 1.0625, `refined start ${rs}`)
  assert.ok(rs - 1.0 >= 0.05 - 0.009, `start silently eats pad: ${rs}`)
  assert.ok(rs < 1.10, 'refined start should reclaim at least part of the grid residue')
  assert.equal(re, 2.875, 'end edge has no loud evidence right of the cut')
})

test('refineGaps never violates the requested pad', () => {
  const rate = 16000
  const mono = new Float32Array(3 * rate)
  for (let i = 0; i < 1.0 * rate; i++) mono[i] = ((i * 7919) % 65535) / 65535 * 0.4 - 0.2
  const refined = refineGaps([[1.125, 2.875]], mono, rate, -45, 0.3)
  // pad 0.3 > available grid gap before evidence → cut stays at grid edge
  assert.ok(Math.abs(refined[0][0] - 1.125) < 0.01, `start ${refined[0][0]}`)
})

test('gap keys + enabledGaps filter', () => {
  const gaps: Range[] = [[1.1234, 2.0], [5.5, 6.0], [9.001, 10.0]]
  assert.equal(gapKeyOf(gaps[0]), 1123)
  const enabled = enabledGaps(gaps, [gapKeyOf(gaps[1]), 999999])
  assert.deepEqual(enabled, [[1.1234, 2.0], [9.001, 10.0]])
})

/* ── manual gap editing ────────────────────────────────────────────────── */

test('normalizeRanges sorts, merges overlaps and drops degenerate', () => {
  assert.deepEqual(
    normalizeRanges([
      [5, 6],
      [1, 2],
      [1.5, 2.5],
      [9, 9],
      [3, 2],
    ]),
    [
      [1, 2.5],
      [5, 6],
    ],
  )
})

test('addGapRange inserts sorted and merges touching ranges', () => {
  const base: Range[] = [
    [1, 2],
    [5, 6],
  ]
  assert.deepEqual(addGapRange(base, [3, 4]), [
    [1, 2],
    [3, 4],
    [5, 6],
  ])
  // overlaps both neighbours → one merged range
  assert.deepEqual(addGapRange(base, [1.5, 5.5]), [[1, 6]])
  // original list is not mutated
  assert.deepEqual(base, [
    [1, 2],
    [5, 6],
  ])
})

test('removeGapByKey drops the matching gap only', () => {
  const gaps: Range[] = [
    [1.123, 2],
    [5.5, 6],
    [9.001, 10],
  ]
  assert.deepEqual(removeGapByKey(gaps, gapKeyOf(gaps[1])), [
    [1.123, 2],
    [9.001, 10],
  ])
  assert.equal(removeGapByKey(gaps, 999999).length, 3)
})

/* ── stretch exactness at 3x ───────────────────────────────────────────── */

test('stretchPair at 3x yields the exact trimmed length', () => {
  const [l, r] = sineStereo(440, 1, 44100)
  const out = stretchPair(l, r, { speed: 3 })
  const frames = out.length / 2
  assert.equal(frames, Math.floor(44100 / 3))
  let peak = 0
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
  assert.ok(peak > 0.4 && peak < 1.0, `peak ${peak}`)
})

/* ── export naming ─────────────────────────────────────────────────────── */

test('buildExportName composes cut/speed suffixes and sanitizes', () => {
  assert.equal(buildExportName('my.lecture-2024.mp3', 20, 1.5, 'mp3'), 'my.lecture-2024_cut_speed1p5x.mp3')
  assert.equal(buildExportName('untouched.wav', 0, 1, 'wav'), 'untouched.wav')
  assert.equal(buildExportName('bad:name?.wav', 3, 2, 'mp3'), 'bad_name__cut_speed2x.mp3')
  assert.equal(buildExportName('onlyspeed.ogg', 0, 0.75, 'wav'), 'onlyspeed_speed0p75x.wav')
})

/* ── loudness normalization ────────────────────────────────────────────── */

test('normalize measures RMS, computes gain, hits the target with a peak ceiling', async () => {
  const rate = 22050
  const n = rate * 2
  const chans = [new Float32Array(n), new Float32Array(n)]
  const amp = 0.08 // quiet recording → RMS ≈ -25 dBFS
  for (let i = 0; i < n; i++) {
    const v = amp * Math.sin((2 * Math.PI * 220 * i) / rate)
    chans[0][i] = v
    chans[1][i] = v
  }
  const rmsBefore = measureRmsDb(chans)
  assert.ok(Math.abs(rmsBefore - (20 * Math.log10(amp / Math.SQRT2))) < 0.01)
  assert.ok(normalizeGainDb(rmsBefore) > 6, `quiet input must be boosted, got ${normalizeGainDb(rmsBefore)}`)

  const res = await normalizeLoudness(chans, { targetDb: NORMALIZE_TARGET_DB })
  assert.ok(Math.abs(res.rmsAfterDb - NORMALIZE_TARGET_DB) < 0.2, `rmsAfter ${res.rmsAfterDb}`)
  let peak = 0
  for (const c of chans) for (const v of c) peak = Math.max(peak, Math.abs(v))
  assert.ok(peak <= 0.8914 + 1e-6, `peak ${peak} must respect the -1 dBFS ceiling`)
})

test('normalize refuses to over-boost a digital-silence file', () => {
  const chans = [new Float32Array(44100)]
  const gain = normalizeGainDb(measureRmsDb(chans))
  assert.ok(gain <= 15, `gain ${gain}`)
})

test('normalize cancellation throws', async () => {
  const chans = [new Float32Array(1 << 21).fill(0.5)]
  await assert.rejects(
    () => normalizeLoudness(chans, { shouldStop: () => true }),
    /NORM_CANCELED/,
  )
})
