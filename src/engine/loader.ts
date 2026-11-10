/**
 * Main-thread companion of the analysis worker:
 * native decode (browser) + aligned chunk streaming into the worker.
 */

import { analysisLengthFor, analysisRangeToNative } from './analysis.ts'

export const DEFAULT_SILENCE: SilenceParamsUi = {
  thresholdDb: -45,
  minGapSec: 0.6,
  padSec: 0.15,
}

export interface SilenceParamsUi {
  thresholdDb: number
  minGapSec: number
  padSec: number
}

/** Files above this size decode at 22.05 kHz (half the memory, lectures only). */
const LOW_MEMORY_LIMIT = 220 * 1024 * 1024

export function chooseNativeRate(fileSize: number): number {
  return fileSize > LOW_MEMORY_LIMIT ? 22050 : 44100
}

const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0))

export async function decodeNative(file: File): Promise<AudioBuffer> {
  const rate = chooseNativeRate(file.size)
  const ab = await file.arrayBuffer()
  // Older WebKit throws on the options-object form of the constructor.
  let ctx: OfflineAudioContext
  try {
    ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 1, sampleRate: rate })
  } catch {
    ctx = new OfflineAudioContext(2, 1, rate)
  }
  const buf = await ctx.decodeAudioData(ab)
  if (!buf || buf.length === 0) throw new Error('DECODE_EMPTY')
  return buf
}

export interface AnalysisDone {
  peakMin: Float32Array
  peakMax: Float32Array
  analysisLen: number
  framesDone: number
}

export interface WorkerInbound {
  type: 'gaps' | 'done' | 'error' | 'stretchProgress' | 'stretchDone' | 'stretchError'
  id: number
  gaps?: number[]
  stats?: { count: number; removedSec: number }
  peakMin?: Float32Array
  peakMax?: Float32Array
  analysisLen?: number
  framesDone?: number
  f?: number
  out?: Float32Array
  canceled?: boolean
  error?: string
}

export type WorkerOutbound =
  | { type: 'open'; id: number; durationSec: number; nativeRate: number }
  | { type: 'chunk'; id: number; l: Float32Array; r: Float32Array; jStart: number; jCount: number; m0: number }
  | { type: 'finish'; id: number }
  | { type: 'silence'; id: number; params: SilenceParamsUi }
  | { type: 'stretch'; id: number; speed: number; l: Float32Array; r: Float32Array }
  | { type: 'stretchCancel'; id: number }

export function createAnalysisWorker(): Worker {
  return new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), {
    type: 'module',
  })
}

/**
 * Streams the decoded buffer into the worker as aligned chunks.
 * Resolves when the worker reports peaks done. Native AudioBuffer is NOT
 * transferred — it stays on the main thread for playback and export.
 */
export async function streamAnalysis(
  buffer: AudioBuffer,
  worker: Worker,
  id: number,
  onProgress: (f: number) => void,
): Promise<AnalysisDone> {
  const nativeRate = buffer.sampleRate
  const durationSec = buffer.duration
  const analysisLen = analysisLengthFor(durationSec)
  worker.postMessage({
    type: 'open',
    id,
    durationSec,
    nativeRate,
  })

  const chans = buffer.numberOfChannels
  const getCh = (c: number): Float32Array => buffer.getChannelData(c < chans ? c : 0)

  const CHUNK_ANALYSIS = 9600 // 600 ms of analysis samples per message
  const total = Math.ceil(analysisLen / CHUNK_ANALYSIS)
  let sent = 0
  const done = new Promise<AnalysisDone>((resolve, reject) => {
    worker.addEventListener('message', (ev: MessageEvent<WorkerInbound>) => {
      const m = ev.data
      if (m.id !== id) return
      if (m.type === 'done' && m.peakMin && m.peakMax) {
        resolve({
          peakMin: m.peakMin,
          peakMax: m.peakMax,
          analysisLen: m.analysisLen ?? analysisLen,
          framesDone: m.framesDone ?? 0,
        })
      } else if (m.type === 'error') {
        reject(new Error(m.error ?? 'ANALYSIS_FAILED'))
      }
    })
    worker.addEventListener('error', (e) => reject(new Error(e.message)))
  })

  for (let jStart = 0; jStart < analysisLen; jStart += CHUNK_ANALYSIS) {
    const jCount = Math.min(CHUNK_ANALYSIS, analysisLen - jStart)
    const [n0, n1] = analysisRangeToNative(jStart, jCount, nativeRate)
    const lo = Math.min(n0, buffer.length)
    const hi = Math.min(n1, buffer.length)
    if (hi <= lo) break
    const l = getCh(0).slice(lo, hi)
    const r = getCh(1).slice(lo, hi)
    worker.postMessage({ type: 'chunk', id, l, r, jStart, jCount, m0: lo }, [
      l.buffer,
      r.buffer,
    ])
    sent++
    if (sent % 3 === 0) {
      onProgress(sent / total)
      await yieldUI()
    }
  }
  onProgress(1)
  worker.postMessage({ type: 'finish', id })
  return done
}

export function requestSilencePlan(
  worker: Worker,
  id: number,
  params: SilenceParamsUi,
): void {
  worker.postMessage({ type: 'silence', id, params })
}
