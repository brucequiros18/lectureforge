import { useEngine } from '../hooks/useEngine'
import { engine, type Toast } from '../engine/store'
import { IconAlert, IconCheck, IconClose, IconInfo } from './Icon'
import type { JSX } from 'react'

const tone: Record<Toast['kind'], { bg: string; icon: JSX.Element }> = {
  ok: { bg: 'border-ok/50', icon: <IconCheck size={16} className="text-ok" /> },
  err: { bg: 'border-cut/50', icon: <IconAlert size={16} className="text-cut" /> },
  info: { bg: 'border-edge2', icon: <IconInfo size={16} className="text-info" /> },
}

export function Toaster(): JSX.Element {
  const { toasts } = useEngine()
  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast panel flex items-start gap-2.5 px-3 py-2.5 shadow-lg shadow-black/40 ${tone[t.kind].bg}`}
          role="status"
        >
          <span className="mt-0.5">{tone[t.kind].icon}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{t.msg}</p>
            {t.detail !== undefined && t.detail !== '' && (
              <p className="mt-0.5 text-xs leading-snug text-dim">{t.detail}</p>
            )}
          </div>
          <button
            onClick={() => engine.dismissToast(t.id)}
            className="btn-ghost -mr-1.5 -mt-1 h-7 w-7 shrink-0 rounded-lg"
            aria-label="Dismiss notification"
          >
            <IconClose size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
