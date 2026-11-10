/**
 * Sample-accurate splicing: turn a keep-plan into output channel data.
 * Input/output are Float32Array channel buffers at the native rate.
 */

export interface Seg {
  start: number
  end: number
}

export function spliceLength(segs: readonly Seg[]): number {
  let len = 0
  for (const s of segs) len += Math.max(0, s.end - s.start)
  return len
}

export function allocSpliced(chCount: number, len: number): Float32Array[] {
  const out: Float32Array[] = []
  for (let c = 0; c < chCount; c++) out.push(new Float32Array(len))
  return out
}

export function spliceInto(src: Float32Array, segs: readonly Seg[], out: Float32Array): void {
  let pos = 0
  for (const s of segs) {
    const a = Math.max(0, Math.min(s.start, src.length))
    const b = Math.max(a, Math.min(s.end, src.length))
    if (b > a) {
      out.set(src.subarray(a, b), pos)
      pos += b - a
    }
  }
}

/** Deinterleave a stereo interleaved stream into two channel arrays. */
export function deinterleave(
  interleaved: Float32Array,
  frames: number,
): [Float32Array, Float32Array] {
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    left[i] = interleaved[i * 2]
    right[i] = interleaved[i * 2 + 1]
  }
  return [left, right]
}

/** Interleave two channel arrays for encoders expecting LRLRLR. */
export function interleave(left: Float32Array, right: Float32Array): Float32Array {
  const out = new Float32Array(left.length * 2)
  for (let i = 0; i < left.length; i++) {
    out[i * 2] = left[i]
    out[i * 2 + 1] = right[i]
  }
  return out
}
