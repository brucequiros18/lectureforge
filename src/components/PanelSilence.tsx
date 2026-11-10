import { useRef } from 'react'
import { useEngine } from '../hooks/useEngine'
import { engine } from '../engine/store'
import { fmtClock, fmtSaved } from '../engine/format'
import { IconScissors } from './Icon'
import { GapList } from './GapList'
import type { JSX } from 'react'
import type { SilenceParamsUi } from '../engine/loader'

type SilenceField = keyof SilenceParamsUi

interface RowProps {
  label: string
  field: SilenceField
  min: number
  max: number
  step: number
  fmt: (v: number) => string
  hint: string
  disabled?: boolean
}

function Row({ label, field, min, max, step, fmt, hint, disabled = false }: RowProps): JSX.Element {
  const { settings } = useEngine()
  const last = useRef(0)
  const value = settings.silence[field]
  return (
    <div className={`mt-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-baseline justify-between">
        <label className="lbl" htmlFor={`sl-${field}`}>
          {label}
        </label>
        <span className="num text-xs text-ink">{fmt(value)}</span>
      </div>
      <input
        id={`sl-${field}`}
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value)
          const now = Date.now()
          // trailing throttle: drags recompute the plan at most every 60ms
          if (now - last.current >= 60) {
            last.current = now
            engine.setSilence({ [field]: v })
          } else {
            setTimeout(() => engine.setSilence({ [field]: v }), 60)
          }
        }}
      />
      <p className="text-[11px] leading-snug text-faint">{hint}</p>
    </div>
  )
}

export function PanelSilence(): JSX.Element {
  const { settings, stats, session, gapMode } = useEngine()
  const spanSec = settings.sel
    ? settings.sel[1] - settings.sel[0]
    : (session?.durationSec ?? 0)
  const afterSec = Math.max(0, spanSec - stats.removedSec)
  const manual = gapMode === 'manual'

  return (
    <section aria-label="Cut silence" className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <IconScissors size={16} className="text-cut" /> Cut silence
        </h2>
        {session !== null && (
          <span className="num text-xs text-dim">
            {stats.count} gaps · −{fmtSaved(stats.removedSec)}
          </span>
        )}
      </div>

      {manual && (
        <p className="mt-2 text-[11px] leading-snug text-faint">
          Manual mode — detection is paused; the sliders below apply when you switch back to Auto.
        </p>
      )}

      <Row
        label="Quiet threshold"
        field="thresholdDb"
        min={-65}
        max={-20}
        step={1}
        fmt={(v) => `${v} dB`}
        hint="Raise to cut hiss, fans and paper rustle. Lower if speech gets cut."
        disabled={manual}
      />
      <Row
        label="Min gap"
        field="minGapSec"
        min={0.1}
        max={3}
        step={0.05}
        fmt={(v) => `${v.toFixed(2)} s`}
        hint="Gaps shorter than this are kept."
        disabled={manual}
      />
      <Row
        label="Keep padding"
        field="padSec"
        min={0}
        max={1.5}
        step={0.05}
        fmt={(v) => `${v.toFixed(2)} s`}
        hint="Natural silence kept around each spoken chunk."
        disabled={manual}
      />

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-dim">
        <input
          type="checkbox"
          className="accent-accent"
          checked={settings.skipSilencePreview}
          onChange={(e) => engine.setSkipSilencePreview(e.target.checked)}
        />
        Preview skips silences (plays speech only)
      </label>

      <GapList />

      {session !== null && stats.count > 0 && (
        <p className="num mt-3 border-t border-edge pt-3 text-xs text-ok">
          Export: {fmtClock(session.durationSec, session.durationSec >= 3600)} →{' '}
          {fmtClock(afterSec, session.durationSec >= 3600)}
        </p>
      )}
    </section>
  )
}
