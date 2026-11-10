import { useEngine } from '../hooks/useEngine'
import { engine } from '../engine/store'
import { fmtClock, fmtBytes } from '../engine/format'
import { IconDownload } from './Icon'
import type { JSX } from 'react'

export function ExportBar(): JSX.Element | null {
  const { session, settings, stats, stage, exportProgress } = useEngine()
  if (!session) return null

  const spanSec = settings.sel ? settings.sel[1] - settings.sel[0] : session.durationSec
  const afterSec = Math.max(0, (spanSec - stats.removedSec) / settings.speed)
  const estBytes = settings.format === 'mp3' ? (afterSec * settings.kbps * 1000) / 8 : afterSec * session.nativeRate * 4

  if (stage === 'exporting' && exportProgress) {
    return (
      <div className="panel sticky bottom-3 z-40 flex shrink-0 items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-ink">{exportProgress.label}</span>
            <span className="num text-dim">{Math.round(exportProgress.f * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-edge">
            <div
              className="h-full rounded-full bg-accent transition-all duration-150"
              style={{ width: `${Math.max(3, exportProgress.f * 100).toFixed(1)}%` }}
            />
          </div>
        </div>
        <button className="btn btn-outline" onClick={() => engine.cancelExport()}>
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="panel sticky bottom-3 z-40 flex shrink-0 flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <select
          className="select"
          value={settings.format}
          onChange={(e) => engine.setFormat(e.target.value as 'mp3' | 'wav')}
          aria-label="Output format"
        >
          <option value="mp3">MP3</option>
          <option value="wav">WAV</option>
        </select>
        {settings.format === 'mp3' && (
          <select
            className="select"
            value={settings.kbps}
            onChange={(e) => engine.setKbps(Number(e.target.value))}
            aria-label="MP3 bitrate"
          >
            {[64, 96, 128, 192, 256].map((k) => (
              <option key={k} value={k}>
                {k}k
              </option>
            ))}
          </select>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-dim" title="Bring the loudness of the export to a consistent level">
          <input
            type="checkbox"
            className="accent-accent"
            checked={settings.normalize}
            onChange={(e) => engine.setNormalize(e.target.checked)}
          />
          Normalize
        </label>
        <span className="num hidden text-xs text-faint sm:inline">≈ {fmtBytes(estBytes)}</span>
      </div>

      <div className="num hidden items-center gap-1.5 text-xs text-dim md:flex">
        <span>{fmtClock(session.durationSec, session.durationSec >= 3600)}</span>
        <span aria-hidden="true">→</span>
        <span className="text-ok">{fmtClock(afterSec, session.durationSec >= 3600)}</span>
        {stats.count > 0 && <span className="rounded bg-edge px-1.5 text-dim">{stats.count} cuts</span>}
        {settings.speed !== 1 && (
          <span className="rounded bg-edge px-1.5 text-dim">{settings.speed.toFixed(2)}×</span>
        )}
        {settings.sel !== null && <span className="rounded bg-edge px-1.5 text-dim">region</span>}
      </div>

      <button
        className="btn btn-primary ml-auto h-10 px-5"
        onClick={() => void engine.exportRun()}
        disabled={afterSec <= 0.05}
      >
        <IconDownload />
        Export {settings.format.toUpperCase()}
      </button>
    </div>
  )
}
