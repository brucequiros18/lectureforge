/// <reference lib="webworker" />
/**
 * Analysis worker: builds + owns the mono 16 kHz copy of the lecture,
 * computes RMS frames + waveform peaks incrementally, answers cheap
 * silence-plan recomputes (slider drags) without resending data, and
 * runs the offline time-stretch so the main thread stays at 60fps during
 * exports. Everything lives for one session; `open` resets state.
 */

import {
  ANALYSIS_RATE,
  FRAME_SEC,
  analysisLengthFor,
  decimateChunk,
  finalizePeaks,
  frameCountFor,
  initPeakArrays,
  meterFrames,
  peakChunk,
} from '../engine/analysis.ts'
import { detectGaps, gapStats, refineGaps, type Range, type SilenceParams } from '../engine/silence.ts'
import { stretchPairAsync } from '../engine/stretch.ts'

interface OpenMsg {
  type: 'open'
  id: number
  durationSec: number
  nativeRate: number
}
interface ChunkMsg {
  type: 'chunk'
  id: number
  l: Float32Array
  r: Float32Array
  jStart: number
  jCount: number
  m0: number
}
interface FinishMsg {
  type: 'finish'
  id: number
}
interface SilenceMsg {
  type: 'silence'
  id: number
  params: SilenceParams
}
interface StretchMsg {
  type: 'stretch'
  id: number
  speed: number
  l: Float32Array
  r: Float32Array
}
interface StretchCancelMsg {
  type: 'stretchCancel'
  id: number
}

type Inbound = OpenMsg | ChunkMsg | FinishMsg | SilenceMsg | StretchMsg | StretchCancelMsg

let sessionId = -1
let nativeRate = 44100
let mono: Float32Array | null = null
let rmsDb: Float32Array | null = null
let peakMin: Float32Array | null = null
let peakMax: Float32Array | null = null
let covered = 0 // analysis samples processed
let rmsDone = 0 // frames metered
let bucketsStarted = 0

// stretch state (independent of the analysis session)
let stretchAbortId = -1
let stretchAbortFlag = false
let stretchBusyId = -1

function reset(idNew: number, durationSec: number, rate: number): void {
  sessionId = idNew
  nativeRate = rate
  const len = analysisLengthFor(durationSec)
  mono = new Float32Array(len)
  rmsDb = new Float32Array(Math.max(64, frameCountFor(len)))
  const { peakMin: pm, peakMax: px } = initPeakArrays()
  peakMin = pm
  peakMax = px
  covered = 0
  rmsDone = 0
  bucketsStarted = 0
}

async function runStretch(msg: StretchMsg): Promise<void> {
  const id = msg.id
  const isCanceled = (): boolean => stretchAbortFlag && stretchAbortId === id
  try {
    const out = await stretchPairAsync(msg.l, msg.r, {
      speed: msg.speed,
      shouldStop: isCanceled,
      onProgress: (done, total) => {
        const f = total > 0 ? done / total : 0
        self.postMessage({ type: 'stretchProgress', id, f: Math.min(1, f) })
      },
    })
    stretchBusyId = -1
    if (isCanceled()) {
      self.postMessage({ type: 'stretchDone', id, canceled: true })
      return
    }
    self.postMessage({ type: 'stretchDone', id, out }, { transfer: [out.buffer] })
  } catch (err) {
    stretchBusyId = -1
    const canceled = err instanceof Error && /CANCELED/i.test(err.message)
    if (canceled || isCanceled()) {
      self.postMessage({ type: 'stretchDone', id, canceled: true })
    } else {
      const msg2 = err instanceof Error ? err.message : String(err)
      self.postMessage({ type: 'stretchError', id, error: msg2 })
    }
  }
}

self.addEventListener('message', (ev: MessageEvent) => {
  const msg = ev.data as Inbound

  if (msg.type === 'stretch') {
    if (stretchBusyId !== msg.id) {
      if (stretchBusyId !== -1) stretchAbortFlag = true // one stretch at a time
      stretchBusyId = msg.id
      stretchAbortId = msg.id
      stretchAbortFlag = false
      void runStretch(msg)
    }
    return
  }
  if (msg.type === 'stretchCancel') {
    if (stretchAbortId === msg.id) stretchAbortFlag = true
    return
  }

  if (msg.type === 'open') {
    reset(msg.id, msg.durationSec, msg.nativeRate)
    return
  }

  if (msg.id !== sessionId) return

  if (msg.type === 'chunk' && mono && rmsDb && peakMin && peakMax) {
    const from = covered
    decimateChunk(msg.l, msg.r, msg.jStart, msg.jCount, msg.m0, nativeRate, mono)
    covered = msg.jStart + msg.jCount
    rmsDone += meterFrames(mono, from, covered, rmsDb, rmsDone)
    bucketsStarted = peakChunk(
      mono,
      from,
      covered,
      mono.length,
      peakMin,
      peakMax,
      bucketsStarted,
    )
    return
  }

  if (msg.type === 'silence' && rmsDb && mono) {
    const raw = detectGaps(rmsDb.slice(0, rmsDone), FRAME_SEC, msg.params)
    // mono lives at ANALYSIS_RATE: sample j ↔ time j/ANALYSIS_RATE
    const gaps = refineGaps(raw, mono, ANALYSIS_RATE, msg.params.thresholdDb, msg.params.padSec)
    const stats = gapStats(gaps)
    self.postMessage({
      type: 'gaps',
      id: msg.id,
      gaps: gaps.map((g: Range) => [g[0], g[1]]).flat(),
      stats,
    })
    return
  }

  if (msg.type === 'finish' && mono && rmsDb && peakMin && peakMax) {
    const fin = finalizePeaks(peakMin, peakMax)
    self.postMessage(
      {
        type: 'done',
        id: msg.id,
        analysisLen: mono.length,
        framesDone: rmsDone,
        peakMin: fin.peakMin,
        peakMax: fin.peakMax,
      },
      { transfer: [fin.peakMin.buffer, fin.peakMax.buffer] },
    )
  }
})
