/**
 * Encoding to WAV (16-bit PCM) or MP3 (lamejs, lazy-loaded ~120 kB KB only
 * when the first MP3 export happens), chunked with honest progress and
 * cooperative cancellation between chunks.
 */

import type { ProgressFn } from './stretch.ts'

export type EncFormat = 'mp3' | 'wav'

export interface EncodeOpts {
  chans: Float32Array[] // 1 or 2 channels, same length
  sampleRate: number
  format: EncFormat
  kbps?: number
  onProgress?: ProgressFn
  shouldStop?: () => boolean
}

export interface WavMeta {
  sampleRate: number
  channels: number
  bitsPerSample: number
  dataLen: number
}

const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0))
const CHUNK_FRAMES_WAV = 240000
const CHUNK_FRAMES_MP3 = 1152 * 90 // ~2.2s at 44.1k

export async function encodeAudio(o: EncodeOpts): Promise<Blob> {
  if (o.format === 'wav') return encodeWav(o)
  return encodeMp3(o)
}

function floatToInt16(v: number): number {
  return v >= 1 ? 32767 : v <= -1 ? -32768 : (v * 32768) | 0
}

export async function encodeWav(o: EncodeOpts): Promise<Blob> {
  const frames = o.chans[0].length
  const chCount = o.chans.length
  const totalSamples = frames * chCount
  const header = wavHeader(frames, chCount, o.sampleRate)

  const data = new Int16Array(totalSamples)
  let s = 0
  for (let f0 = 0; f0 < frames; f0 += CHUNK_FRAMES_WAV) {
    if (o.shouldStop?.()) throw new Error('ENC_CANCELED')
    const f1 = Math.min(frames, f0 + CHUNK_FRAMES_WAV)
    for (let f = f0; f < f1; f++) {
      for (let c = 0; c < chCount; c++) {
        data[s++] = floatToInt16(o.chans[c][f])
      }
    }
    o.onProgress?.(s, totalSamples)
    await yieldUI()
  }
  o.onProgress?.(totalSamples, totalSamples)
  return new Blob([header, data.buffer as ArrayBuffer], { type: 'audio/wav' })
}

export async function encodeMp3(o: EncodeOpts): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const frames = o.chans[0].length
  const chCount = o.chans.length
  const kbps = o.kbps ?? 128
  const enc = new Mp3Encoder(chCount, o.sampleRate, kbps)

  const parts: Uint8Array[] = []
  const l16 = new Int16Array(CHUNK_FRAMES_MP3)
  const r16 = new Int16Array(CHUNK_FRAMES_MP3)
  let doneFrames = 0

  for (let f0 = 0; f0 < frames; f0 += CHUNK_FRAMES_MP3) {
    if (o.shouldStop?.()) throw new Error('ENC_CANCELED')
    const f1 = Math.min(frames, f0 + CHUNK_FRAMES_MP3)
    const count = f1 - f0
    for (let f = f0; f < f1; f++) {
      l16[f - f0] = floatToInt16(o.chans[0][f])
      if (chCount === 2) r16[f - f0] = floatToInt16(o.chans[1][f])
    }
    const l = count === CHUNK_FRAMES_MP3 ? l16 : l16.subarray(0, count)
    const r = chCount === 2 ? (count === CHUNK_FRAMES_MP3 ? r16 : r16.subarray(0, count)) : undefined
    const bytes = chCount === 2 ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l)
    if (bytes.length > 0) parts.push(bytes)
    doneFrames = f1
    o.onProgress?.(doneFrames, frames)
    if (f1 < frames) await yieldUI()
  }

  const tail = enc.flush()
  if (tail.length > 0) parts.push(tail)
  o.onProgress?.(frames, frames)
  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' })
}

function wavHeader(frames: number, chCount: number, sampleRate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44)
  const v = new DataView(buf)
  const byteRate = sampleRate * chCount * 2
  writeStr(v, 0, 'RIFF')
  v.setUint32(4, 36 + frames * chCount * 2, true)
  writeStr(v, 8, 'WAVE')
  writeStr(v, 12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, chCount, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, byteRate, true)
  v.setUint16(32, chCount * 2, true)
  v.setUint16(34, 16, true)
  writeStr(v, 36, 'data')
  v.setUint32(40, frames * chCount * 2, true)
  return buf
}

function writeStr(v: DataView, off: number, s: string): void {
  for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
}

/** Tiny WAV parser — used by tests to validate encoder output. */
export function parseWavMeta(bytes: Uint8Array): WavMeta | null {
  if (bytes.length < 44) return null
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = str(v, 0, 4)
  if (tag !== 'RIFF') return null
  const channels = v.getUint16(22, true)
  const sampleRate = v.getUint32(24, true)
  const bits = v.getUint16(34, true)
  const dataLen = v.getUint32(40, true)
  return { sampleRate, channels, bitsPerSample: bits, dataLen }
}

function str(v: DataView, off: number, len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) s += String.fromCharCode(v.getUint8(off + i))
  return s
}
