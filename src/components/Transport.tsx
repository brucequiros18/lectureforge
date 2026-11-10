import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useEngine } from '../hooks/useEngine'
import { engine } from '../engine/store'
import { fmtClock } from '../engine/format'
import { IconBack5, IconFwd5, IconLoop, IconPause, IconPlay } from './Icon'

export function Transport(): JSX.Element | null {
  const { session, settings, playing } = useEngine()
  const [, force] = useState(0)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = (): void => {
      force((v) => (v + 1) % 1000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  if (!session) return null
  const a = engine.audio
  const cur = a?.currentTime ?? 0
  const spansRegion = settings.sel !== null

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl bg-panel p-1">
        <button className="btn btn-ghost h-9 w-9" title="Back 5s" onClick={() => engine.seek(cur - 5)}>
          <IconBack5 />
        </button>
        <button
          className="btn btn-primary h-10 w-14"
          onClick={() => engine.togglePlay()}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <IconPause size={18} /> : <IconPlay size={18} />}
        </button>
        <button className="btn btn-ghost h-9 w-9" title="Forward 5s" onClick={() => engine.seek(cur + 5)}>
          <IconFwd5 />
        </button>
      </div>

      <div className="num flex items-baseline gap-1 whitespace-nowrap rounded-xl bg-panel px-3 py-2 text-sm text-ink">
        <span>{fmtClock(cur, session.durationSec >= 3600)}</span>
        <span className="text-faint">/</span>
        <span>{fmtClock(session.durationSec, session.durationSec >= 3600)}</span>
      </div>

      <button
        className={`btn h-9 ${spansRegion ? 'btn-outline ring-1 ring-accent/60' : 'btn-ghost'}`}
        title={`Trim region ${spansRegion ? 'clear' : 'off'} (L)`}
        onClick={() => engine.setSelection(spansRegion ? null : [cur, session.durationSec])}
      >
        <IconLoop /> {spansRegion ? 'Region on' : 'Region'}
      </button>

      {settings.sel !== null && spansRegion && (
        <button className="btn btn-ghost h-9" onClick={() => engine.setSelection(null)} title="Clear region (L)">
          <span className="num text-xs text-accent">
            {fmtClock(settings.sel![0])}–{fmtClock(settings.sel![1])}
          </span>
          <span className="text-faint">✕</span>
        </button>
      )}
    </div>
  )
}
