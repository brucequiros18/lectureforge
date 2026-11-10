/**
 * Pure analysis math shared by the web worker, the main thread and node tests.
 * Analysis pipeline: mono 16 kHz, 128 ms frames for silence metering, fixed
 * bucket count for waveform peaks (duration-independent memory).
 */

export const ANALYSIS_RATE = 16000
export const FRAME_SAMPLES = 2048
export const PEAK_BUCKETS = 2400
export const FRAME_SEC = FRAME_SAMPLES / ANALYSIS_RATE

/** Maps an analysis-sample range to its native sample range (per-box, no bleed). */
export function analysisRangeToNative(
  jStart: number,
  jCount: number,
  nativeRate: number,
): [number, number] {
  const stride = nativeRate / ANALYSIS_RATE
  return [
    Math.floor(jStart * stride),
    Math.ceil((jStart + jCount) * stride),
  ]
}

export function analysisLengthFor(durationSec: number): number {
  return Math.max(1, Math.round(durationSec * ANALYSIS_RATE))
}

export function frameCountFor(monoLen: number): number {
  return Math.floor(monoLen / FRAME_SAMPLES)
}

export function toDb(x: number): number {
  return 20 * Math.log10(Math.max(x, 1e-6))
}

/** Downmix (L+R)/2 + box-decimate to ANALYSIS_RATE for one aligned chunk. */
export function decimateChunk(
  l: Float32Array,
  r: Float32Array,
  jStart: number,
  jCount: number,
  nativeOffset: number,
  nativeRate: number,
  out: Float32Array,
): void {
  const stride = nativeRate / ANALYSIS_RATE
  for (let j = 0; j < jCount; j++) {
    const n0 = Math.floor((jStart + j) * stride) - nativeOffset
    const n1 = Math.floor((jStart + j + 1) * stride) - nativeOffset
    let sum = 0
    let count = 0
    for (let k = n0; k < n1; k++) {
      sum += (l[k] + r[k]) * 0.5
      count++
    }
    out[jStart + j] = count > 0 ? sum / count : 0
  }
}

/** Incremental per-frame RMS in dBFS. Returns number of complete frames consumed. */
export function meterFrames(
  mono: Float32Array,
  from: number,
  to: number,
  rmsDb: Float32Array,
  rmsFrom: number,
): number {
  let frameIdx = Math.floor(from / FRAME_SAMPLES)
  let rmsIdx = rmsFrom
  const limit = Math.floor(to / FRAME_SAMPLES)
  for (; frameIdx < limit; frameIdx++, rmsIdx++) {
    const base = frameIdx * FRAME_SAMPLES
    let sum = 0
    for (let k = base; k < base + FRAME_SAMPLES; k++) {
      sum += mono[k] * mono[k]
    }
    const rms = Math.sqrt(sum / FRAME_SAMPLES)
    rmsDb[rmsIdx] = toDb(rms)
  }
  return rmsIdx - rmsFrom
}

/** Incremental min/max peaks into PEAK_BUCKETS buckets over mono[from, to). */
export function peakChunk(
  mono: Float32Array,
  from: number,
  to: number,
  monoLenTotal: number,
  peakMin: Float32Array,
  peakMax: Float32Array,
  bucketsDone: number,
): number {
  const bucketLen = monoLenTotal / PEAK_BUCKETS
  let b = bucketsDone
  let cursor = from
  while (cursor < to) {
    const bStart = Math.floor(b * bucketLen)
    const bEnd = Math.min(monoLenTotal, Math.floor((b + 1) * bucketLen))
    if (bStart >= monoLenTotal) break
    while (cursor < bStart) cursor = bStart
    const scan = Math.min(to, bEnd)
    if (scan <= cursor) break
    let lo = Infinity
    let hi = -Infinity
    for (let i = cursor; i < scan; i++) {
      const v = mono[i]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    const p = b % PEAK_BUCKETS
    const curLo = peakMin[p]
    const curHi = peakMax[p]
    if (lo < curLo) peakMin[p] = lo
    if (hi > curHi) peakMax[p] = hi
    cursor = scan
    if (scan >= bEnd) b++
  }
  return b
}

export function initPeakArrays(): { peakMin: Float32Array; peakMax: Float32Array } {
  return {
    peakMin: new Float32Array(PEAK_BUCKETS).fill(Infinity),
    peakMax: new Float32Array(PEAK_BUCKETS).fill(-Infinity),
  }
}

/** Normalize null/Infinity leftovers so the canvas can trust every bucket. */
export function finalizePeaks(peakMin: Float32Array, peakMax: Float32Array): {
  peakMin: Float32Array
  peakMax: Float32Array
} {
  for (let i = 0; i < PEAK_BUCKETS; i++) {
    if (!Number.isFinite(peakMin[i]) && !Number.isFinite(peakMax[i])) {
      peakMin[i] = 0
      peakMax[i] = 0
    }
    if (peakMin[i] > 0) peakMin[i] = 0
    if (peakMax[i] < 0) peakMax[i] = 0
  }
  return { peakMin, peakMax }
}
