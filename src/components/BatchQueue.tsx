import { useEngine } from '../hooks/useEngine'
import { engine } from '../engine/store'
import { fmtBytes } from '../engine/format'
import { IconAlert, IconClose } from './Icon'
import type { JSX } from 'react'

const dot: Record<string, string> = {
  waiting: 'bg-faint',
  loading: 'bg-accent animate-pulse',
  ready: 'bg-ok',
  error: 'bg-cut',
}

export function BatchQueue(): JSX.Element | null {
  const { items, activeId } = useEngine()
  if (items.length <= 1) return null
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((it) => (
        <div
          key={it.id}
          className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-colors duration-100 ${
            it.id === activeId ? 'border-accent/60 bg-panel2' : 'border-edge bg-panel'
          }`}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${dot[it.status]}`} aria-hidden="true" />
          <button
            className="max-w-44 truncate text-left text-dim hover:text-ink"
            onClick={() => engine.selectItem(it.id)}
            title={it.name}
          >
            {it.name}
          </button>
          <span className="num shrink-0 text-faint">{fmtBytes(it.size)}</span>
          {it.status === 'error' && (
            <>
              <IconAlert size={13} className="shrink-0 text-cut" />
              <button
                className="btn btn-ghost h-7 px-2 text-[11px]"
                title="Try loading this file again"
                onClick={() => engine.retryItem(it.id)}
              >
                Retry
              </button>
            </>
          )}
          <button
            className="btn btn-ghost -mr-2 h-7 w-7"
            aria-label={`Remove ${it.name} from queue`}
            onClick={() => engine.removeItem(it.id)}
          >
            <IconClose size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
