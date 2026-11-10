/**
 * Pitch-preserving time-stretch via SoundTouchJS, run offline:
 * WebAudioBufferSource + SoundTouch pipe + SimpleFilter.extract() loop.
 * Input: two channel arrays (frames). Output: interleaved stereo frames.
 * Both a synchronous version (tests) and an async version (UI export,
 * cooperative cancel/progress between extract chunks).
 */

import { SimpleFilter, SoundTouch } from 'soundtouchjs'
import type { WebAudioBufferSource } from 'soundtouchjs'

export const SPEED_PRESETS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5] as const
export const MIN_SPEED = 0.5
export const MAX_SPEED = 4

export type ProgressFn = (done: number, total: number) => void

export interface StretchOpts {
  speed: number
  onProgress?: ProgressFn
  shouldStop?: () => boolean
}

const EXTRACT_FRAMES = 8192

/**
 * SimpleFilter drops any input tail it can't fill into a 16384-frame working
 * window — fatal for offline exports (up to ~0.4s of real audio lost).
 * Fix: feed the filter through a quiet-pad source; SoundTouch keeps
 * processing zeros past the real audio, and the real output length is
 * recovered as exactly floor(N/tempo) frames.
 */
const PAD_FRAMES = 24576

function clampSpeed(s: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, s))
}

class PaddedStereoSource {
  private left: Float32Array
  private right: Float32Array
  private total: number

  constructor(left: Float32Array, right: Float32Array, total: number) {
    this.left = left
    this.right = right
    this.total = total
  }

  extract(target: Float32Array, numFrames = 0, position = 0): number {
    const n = Math.min(this.left.length, this.right.length)
    let i = 0
    for (; i < numFrames; i++) {
      const p = position + i
      if (p < n) {
        target[i * 2] = this.left[p]
        target[i * 2 + 1] = this.right[p]
      } else if (p < this.total) {
        target[i * 2] = 0
        target[i * 2 + 1] = 0
      } else {
        break
      }
    }
    return i
  }
}

function makeFilter(left: Float32Array, right: Float32Array, speed: number): {
  filter: SimpleFilter
  inFrames: number
} {
  const touch = new SoundTouch()
  touch.tempo = clampSpeed(speed)
  touch.stretch.quickSeek = false // offline export → full-quality WSOLA scan
  const n = Math.min(left.length, right.length)
  const source = new PaddedStereoSource(left, right, n + PAD_FRAMES)
  const filter = new SimpleFilter(source as unknown as WebAudioBufferSource, touch)
  return { filter, inFrames: n }
}

/** Assemble extract parts into a buffer trimmed to the true stretched length. */
function assemble(parts: Float32Array[], outFrames: number, expectedFrames: number): Float32Array {
  const keepFrames = Math.min(outFrames, expectedFrames)
  const out = new Float32Array(keepFrames * 2)
  let pos = 0
  for (const p of parts) {
    if (pos >= out.length) break
    const take = Math.min(p.length, out.length - pos)
    out.set(p.subarray(0, take), pos)
    pos += take
  }
  return out
}

function interleaveNow(left: Float32Array, right: Float32Array, frames: number): Float32Array {
  const out = new Float32Array(frames * 2)
  for (let i = 0; i < frames; i++) {
    out[i * 2] = left[i]
    out[i * 2 + 1] = right[i]
  }
  return out
}

/** Synchronous whole-buffer stretch. Tests + tiny inputs. */
export function stretchPair(
  left: Float32Array,
  right: Float32Array,
  opts: StretchOpts,
): Float32Array {
  const speed = clampSpeed(opts.speed)
  const inFrames = Math.min(left.length, right.length)
  if (inFrames === 0 || Math.abs(speed - 1) < 1e-4) {
    return interleaveNow(left, right, inFrames)
  }
  const { filter } = makeFilter(left, right, speed)
  const expectedFrames = Math.floor(inFrames / speed)
  const parts: Float32Array[] = []
  let outFrames = 0
  const totalEstimate = expectedFrames
  for (;;) {
    if (opts.shouldStop?.()) return interleaveNow(left, right, inFrames)
    const buf = new Float32Array(EXTRACT_FRAMES * 2)
    const got = filter.extract(buf, EXTRACT_FRAMES)
    if (got <= 0) break
    parts.push(got === EXTRACT_FRAMES ? buf : buf.slice(0, got * 2))
    outFrames += got
    opts.onProgress?.(Math.min(outFrames, totalEstimate), totalEstimate)
  }
  return assemble(parts, outFrames, expectedFrames)
}

const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * Async variant for the UI export path: same pipeline, but yields to the
 * event loop between extract batches so progress bars/cancel buttons work.
 * Throws Error('STRETCH_CANCELED') when shouldStop turns true.
 */
export async function stretchPairAsync(
  left: Float32Array,
  right: Float32Array,
  opts: StretchOpts,
): Promise<Float32Array> {
  const speed = clampSpeed(opts.speed)
  const inFrames = Math.min(left.length, right.length)
  if (inFrames === 0 || Math.abs(speed - 1) < 1e-4) {
    return interleaveNow(left, right, inFrames)
  }
  const filter = makeFilter(left, right, speed).filter
  const expectedFrames = Math.floor(inFrames / speed)
  const totalEstimate = expectedFrames
  const parts: Float32Array[] = []
  let outFrames = 0
  let sinceYield = 0

  for (;;) {
    if (opts.shouldStop?.()) throw new Error('STRETCH_CANCELED')
    const buf = new Float32Array(EXTRACT_FRAMES * 2)
    const got = filter.extract(buf, EXTRACT_FRAMES)
    if (got <= 0) break
    parts.push(got === EXTRACT_FRAMES ? buf : buf.slice(0, got * 2))
    outFrames += got
    if (++sinceYield % 8 === 0) {
      opts.onProgress?.(Math.min(outFrames, totalEstimate), totalEstimate)
      await yieldTick()
    }
  }
  opts.onProgress?.(totalEstimate, totalEstimate)
  return assemble(parts, outFrames, expectedFrames)
}
