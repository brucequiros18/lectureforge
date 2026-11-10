import { useEngine } from '../hooks/useEngine'
import { engine } from '../engine/store'
import { fmtClock } from '../engine/format'
import { IconRedo, IconTrash, IconUndo } from './Icon'
import type { JSX } from 'react'

function GapRow(props: { a: number; b: number; excluded: boolean; hover: boolean }): JSX.Element {
  const { a, b, excluded, hover } = props
  const key = Math.round(a * 1000)
  return (
    <div
      className={`flex w-full items-center gap-1 rounded-lg pr-1 transition-colors ${
        hover ? 'bg-panel2' : ''
      }`}
      onMouseEnter={() => engine.setHoverGap(key)}
      onMouseLeave={() => engine.setHoverGap(null)}
    >
      <button
        type="button"
        aria-pressed={excluded}
        onFocus={() => engine.setHoverGap(key)}
        onBlur={() => engine.setHoverGap(null)}
        onClick={() => engine.toggleGap(key)}
        className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
          excluded ? 'text-faint line-through opacity-60' : 'text-dim hover:bg-panel2'
        }`}
        title={excluded ? 'Keep this gap in the export (click to re-enable)' : 'Cut this gap (click to keep it)'}
      >
        <span className="num shrink-0">
          {fmtClock(a, false)}–{fmtClock(b, false)}
        </span>
        <span className="num shrink-0 text-ink">{(b - a).toFixed(1)}s</span>
      </button>
      <button
        type="button"
        className="btn btn-ghost h-6 w-6 shrink-0 p-0 text-faint hover:text-cut"
        title="Delete this gap permanently"
        aria-label={`Delete gap ${fmtClock(a, false)}`}
        onClick={() => engine.deleteGap(key)}
      >
        <IconTrash size={13} />
      </button>
    </div>
  )
}

export function GapList(): JSX.Element | null {
  const { session, gaps, excludedGaps, hoverGap, settings, gapMode, canUndo, canRedo } = useEngine()
  if (!session) return null

  const disabled = settings.skipSilencePreview
  const manual = gapMode === 'manual'
  const sel = settings.sel
  return (
    <div className="mt-4 border-t border-edge pt-3" aria-label="Detected gaps review" role="group">
      <div className="flex items-center justify-between gap-2">
        <span className="lbl whitespace-nowrap">Gaps</span>
        <div className="flex items-center gap-1">
          <div
            className="flex items-center rounded-lg border border-edge p-0.5"
            role="group"
            aria-label="Gap mode"
          >
            <button
              type="button"
              aria-pressed={!manual}
              className={`btn h-8 text-[11px] ${!manual ? 'btn-outline' : 'btn-ghost'}`}
              onClick={() => engine.setGapMode('auto')}
              title="Detect gaps automatically from the silence threshold"
            >
              Auto
            </button>
            <button
              type="button"
              aria-pressed={manual}
              className={`btn h-8 text-[11px] ${manual ? 'btn-outline' : 'btn-ghost'}`}
              onClick={() => engine.setGapMode('manual')}
              title="Freeze detection and edit gaps by hand"
            >
              Manual
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost h-8 w-8 p-0"
            onClick={() => engine.undo()}
            disabled={!canUndo}
            aria-label="Undo gap edit"
            title="Undo (Ctrl+Z)"
          >
            <IconUndo size={16} />
          </button>
          <button
            type="button"
            className="btn btn-ghost h-8 w-8 p-0"
            onClick={() => engine.redo()}
            disabled={!canRedo}
            aria-label="Redo gap edit"
            title="Redo (Ctrl+Shift+Z)"
          >
            <IconRedo size={16} />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        {manual && (
          <button
            type="button"
            className="btn btn-ghost text-[11px]"
            onClick={() => sel && engine.addGap(sel[0], sel[1])}
            disabled={!sel}
            title={sel ? 'Add the selected region as a gap' : 'Drag a region on the waveform first'}
          >
            + Add gap
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost text-[11px]"
          onClick={() => engine.excludeShortGaps(0.5)}
          title="Keep all gaps shorter than 0.5 s"
        >
          Keep short &lt; 0.5 s
        </button>
        {excludedGaps.length > 0 && (
          <button type="button" className="btn btn-ghost text-[11px]" onClick={() => engine.includeAllGaps()}>
            Include all
          </button>
        )}
      </div>

      {manual && (
        <p className="mt-1 text-[11px] leading-snug text-faint">
          Manual mode — detection paused. Drag a region on the waveform, then add it as a gap.
        </p>
      )}

      {gaps.length === 0 ? (
        <p className="mt-2 text-[11px] leading-snug text-faint">
          {manual
            ? 'No gaps. Drag a region on the waveform and add it.'
            : 'No gaps detected — try raising the quiet threshold.'}
        </p>
      ) : (
        <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto pr-1">
          {gaps.map((g) => {
            const key = Math.round(g[0] * 1000)
            return (
              <li key={key}>
                <GapRow a={g[0]} b={g[1]} excluded={excludedGaps.includes(key)} hover={hoverGap === key} />
              </li>
            )
          })}
        </ul>
      )}

      {excludedGaps.length > 0 && (
        <p className="mt-2 text-[11px] text-ok">
          {excludedGaps.length} {excludedGaps.length === 1 ? 'gap' : 'gaps'} kept — excluded from export
          {disabled ? '' : ' and skipped-silence preview'}.
        </p>
      )}
    </div>
  )
}
