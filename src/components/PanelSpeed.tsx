import { useEngine } from '../hooks/useEngine'
import { engine } from '../engine/store'
import { SPEED_PRESETS } from '../engine/stretch'
import { IconGauge } from './Icon'
import type { JSX } from 'react'

export function PanelSpeed(): JSX.Element {
  const { settings } = useEngine()
  const speed = settings.speed

  return (
    <section aria-label="Playback speed" className="panel p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <IconGauge size={16} className="text-accent" /> Speed
        </h2>
        <span className="num text-xs text-accent">{speed.toFixed(2)}×</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Speed presets">
        {SPEED_PRESETS.map((p) => (
          <button
            key={p}
            className={`num h-8 rounded-lg px-2.5 text-xs transition-colors duration-100 ${
              Math.abs(p - speed) < 0.001
                ? 'bg-accent font-bold text-accent-ink'
                : 'bg-panel2 text-dim hover:text-ink'
            }`}
            onClick={() => engine.setSpeed(p)}
            aria-pressed={Math.abs(p - speed) < 0.001}
          >
            {p}×
          </button>
        ))}
      </div>

      <input
        aria-label="Fine speed"
        type="range"
        className="mt-3 w-full"
        min={0.5}
        max={3}
        step={0.05}
        value={speed}
        onChange={(e) => engine.setSpeed(Number(e.target.value))}
      />
      <p className="text-[11px] leading-snug text-faint">
        Pitch stays natural in preview and in the exported file.
      </p>
    </section>
  )
}
