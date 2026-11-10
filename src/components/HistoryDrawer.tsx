import { useEffect, useRef } from 'react'
import { useEngine } from '../hooks/useEngine'
import { engine } from '../engine/store'
import { fmtClock } from '../engine/format'
import { IconClose, IconHistory } from './Icon'
import type { JSX } from 'react'

function fmtWhen(at: number): string {
  const d = new Date(at)
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function HistoryDrawer(props: { onClose: () => void }): JSX.Element {
  const { history } = useEngine()
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Recent exports"
      onClick={props.onClose}
    >
      <div
        className="drawer-item flex h-full w-full max-w-sm flex-col border-l border-edge bg-panel shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <IconHistory size={16} /> Recent exports
          </h2>
          <button
            ref={closeRef}
            className="btn btn-ghost h-8 w-8"
            aria-label="Close history"
            onClick={props.onClose}
          >
            <IconClose size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {history.length === 0 && (
            <p className="mt-8 text-center text-sm text-faint">
              Exports land here with how much time they saved.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-xl border border-edge bg-panel2 px-3 py-2.5">
                <p className="truncate text-sm text-ink" title={h.name}>
                  {h.name}
                </p>
                <p className="num mt-1 text-xs text-dim">
                  {fmtClock(h.beforeSec, h.beforeSec >= 3600)} →{' '}
                  <span className="text-ok">{fmtClock(h.afterSec, h.afterSec >= 3600)}</span>
                  <span className="mx-1.5 text-faint">·</span>
                  {h.format}
                  <span className="mx-1.5 text-faint">·</span>
                  {fmtWhen(h.at)}
                </p>
              </li>
            ))}
          </ul>
        </div>
        {history.length > 0 && (
          <div className="border-t border-edge p-3">
            <button
              className="btn btn-ghost w-full justify-center text-xs"
              onClick={() => {
                void engine.clearHistory()
                props.onClose()
              }}
            >
              Clear history
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
