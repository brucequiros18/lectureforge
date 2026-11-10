import { useEngine } from '../hooks/useEngine'
import { engine } from '../engine/store'
import { fmtClock } from '../engine/format'
import { IconHistory, IconKeyboard, IconMic, IconOffline, IconQueue } from './Icon'
import type { JSX } from 'react'

export function TopBar(props: {
  onHistory: () => void
  onShortcuts: () => void
}): JSX.Element {
  const { online, recState, recSec, items, stage } = useEngine()
  const hasSession = stage === 'ready' || stage === 'exporting'

  return (
    <header className="flex items-center gap-3 border-b border-edge bg-panel px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M2 12h4l2-6 2 12 2-9 2 6 2-3h6"
              fill="none"
              stroke="#241700"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="hidden min-[480px]:block leading-tight">
          <h1 className="text-sm font-bold text-ink">LectureForge</h1>
          <p className="text-[10px] uppercase tracking-[0.14em] text-faint">lecture audio, condensed</p>
        </div>
      </div>

      {!online && (
        <span className="num ml-2 hidden items-center gap-1.5 rounded-full border border-edge px-2.5 py-1 text-[11px] text-dim sm:flex">
          <IconOffline size={13} /> offline-ready
        </span>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {hasSession && (
          <button
            className={`btn h-9 ${recState === 'off' ? 'btn-ghost' : 'btn-outline ring-1 ring-cut/70'}`}
            onClick={() => void engine.recordArm()}
            title="Record a new lecture"
          >
            <IconMic size={16} className={recState === 'recording' ? 'rec-live text-cut' : undefined} />
            {recState === 'recording' ? (
              <span className="num text-xs">{fmtClock(recSec, false)}</span>
            ) : (
              'REC'
            )}
          </button>
        )}
        {items.length > 1 && (
          <span className="num hidden items-center gap-1.5 text-xs text-dim md:flex" title="Queued recordings">
            <IconQueue size={14} /> {items.length}
          </span>
        )}
        <button
          className="btn btn-ghost h-9 w-9"
          title="Recent exports"
          aria-label="Recent exports"
          onClick={props.onHistory}
        >
          <IconHistory />
        </button>
        <button
          className="btn btn-ghost h-9 w-9"
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
          onClick={props.onShortcuts}
        >
          <IconKeyboard />
        </button>
      </div>
    </header>
  )
}
