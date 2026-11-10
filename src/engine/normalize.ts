/**
 * Loudness normalization for exports: measures the mean RMS level of the
 * kept audio, computes a linear gain toward a speech-friendly target
 * (-16 dB RMS), and applies it in place with a -1 dBFS peak ceiling.
 * Chunked + cancellable, mirroring the encoder's contract.
 */

export const NORMALIZE_TARGET_DB = -16 // RMS target for speech content
export const NORMALIZE_CEIL_DB = -1 // true-peak ceiling after gain
export const NORMALIZE_MAX_BOOST_DB = 15 // never amplify hiss into audibility
export const NORMALIZE_MAX_CUT_DB = -30 // attenuating more is pointless

export function toDb(x: number): number {
  return 20 * Math.log10(Math.max(x, 1e-9))
}

/** Mean RMS (dB) across all channels — silence-free content assumed. */
export function measureRmsDb(chans: readonly Float32Array[]): number {
  let sum = 0
  let count = 0
  for (const c of chans) {
    for (let i = 0; i < c.length; i++) {
      sum += c[i] * c[i]
    }
    count += c.length
  }
  if (count === 0) return toDb(0)
  return toDb(Math.sqrt(sum / count))
}

/** Gain (dB) that moves `rmsDb` to `targetDb`, clamped to sane bounds. */
export function normalizeGainDb(
  rmsDb: number,
  targetDb: number = NORMALIZE_TARGET_DB,
): number {
  const g = targetDb - rmsDb
  return Math.min(NORMALIZE_MAX_BOOST_DB, Math.max(NORMALIZE_MAX_CUT_DB, g))
}

const CHUNK = 1 << 20 // 1M samples per work chunk

export interface NormalizeOpts {
  targetDb?: number
  onProgress?: (done: number, total: number) => void
  shouldStop?: () => boolean
}

/**
 * Applies the normalization gain in place to every channel, with a hard
 * ceiling at -1 dBFS for the rare peaks a linear gain pushes past full
 * scale. Yields between chunks so the progress bar stays live.
 */
export async function normalizeLoudness(
  chans: Float32Array[],
  opts: NormalizeOpts = {},
): Promise<{ gainDb: number; rmsBeforeDb: number; rmsAfterDb: number }> {
  const rmsBefore = measureRmsDb(chans)
  const gainDb = normalizeGainDb(rmsBefore, opts.targetDb)
  const gain = Math.pow(10, gainDb / 20)
  const ceil = Math.pow(10, NORMALIZE_CEIL_DB / 20)

  const total = chans.reduce((s, c) => s + c.length, 0)
  let done = 0
  for (const c of chans) {
    for (let base = 0; base < c.length; base += CHUNK) {
      if (opts.shouldStop?.()) throw new Error('NORM_CANCELED')
      const end = Math.min(c.length, base + CHUNK)
      for (let i = base; i < end; i++) {
        const v = c[i] * gain
        c[i] = v > ceil ? ceil : v < -ceil ? -ceil : v
      }
      done += end - base
      opts.onProgress?.(done, total)
      await new Promise<void>((r) => setTimeout(r, 0))
    }
  }
  return { gainDb, rmsBeforeDb: rmsBefore, rmsAfterDb: measureRmsDb(chans) }
}
