import { useEngine } from '../hooks/useEngine'
import { engine } from '../engine/store'
import { fmtClock } from '../engine/format'
import { IconStop } from './Icon'
import type { JSX } from 'react'

export function RecorderPanel(): JSX.Element | null {
  const { recState, recCount, recSec, recTranscript } = useEngine()

  if (recState === 'off') return null

  if (recState === 'countdown') {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3 rise">
          <div className="num text-7xl font-bold text-accent">{recCount > 0 ? recCount : '…'}</div>
          <p className="text-sm text-dim">Say a few words so the level meter can see your voice…</p>
          <button className="btn btn-ghost" onClick={() => engine.recordCancel()}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-[min(94vw,640px)] -translate-x-1/2">
      {recTranscript && (
        <p
          aria-live="polite"
          className="panel mb-2 max-h-24 overflow-y-auto px-4 py-2 text-xs leading-relaxed text-dim"
        >
          {recTranscript}
        </p>
      )}
      <div className="panel flex flex-wrap items-center justify-center gap-3 px-4 py-3 sm:justify-between">
        <span className="flex items-center gap-2">
          <span className="rec-live h-3 w-3 rounded-full bg-cut" aria-hidden="true" />
          <span className="lbl">Recording</span>
        </span>
        <span className="num text-lg text-ink">{fmtClock(recSec, false)}</span>
        <span className="flex items-center gap-2">
          <button className="btn btn-outline" onClick={() => engine.recordCancel()}>
            Discard
          </button>
          <button className="btn btn-primary" onClick={() => engine.recordStop()}>
            <IconStop size={14} /> Stop ({fmtClock(recSec, false)})
          </button>
        </span>
      </div>
    </div>
  )
}
