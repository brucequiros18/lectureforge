import { useEffect, useRef } from 'react'
import { IconClose, IconKeyboard } from './Icon'
import type { JSX } from 'react'

const KEYS: Array<[string, string]> = [
  ['Space', 'Play / pause'],
  ['← / →', 'Seek ∓5s'],
  ['I', 'Set trim-in at playhead'],
  ['O', 'Set trim-out at playhead'],
  ['L', 'Clear trim region'],
  ['Ctrl+Z', 'Undo gap edit'],
  ['Ctrl+Shift+Z', 'Redo gap edit'],
  ['Wheel', 'Zoom the waveform'],
  ['Double-click', 'Zoom out to full view'],
  ['?', 'This panel'],
]

export function ShortcutsModal(props: { onClose: () => void }): JSX.Element {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={props.onClose}
    >
      <div
        className="panel rise w-full max-w-sm p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <IconKeyboard size={16} /> Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            className="btn btn-ghost h-8 w-8"
            aria-label="Close shortcuts"
            onClick={props.onClose}
          >
            <IconClose size={16} />
          </button>
        </div>
        <dl className="mt-3 divide-y divide-edge">
          {KEYS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2">
              <dt className="num rounded-md border border-edge2 bg-panel2 px-2 py-0.5 text-xs text-accent">{k}</dt>
              <dd className="text-sm text-dim">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
