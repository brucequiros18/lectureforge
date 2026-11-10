import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { PointerEvent as RPointerEvent, WheelEvent as RWheelEvent } from 'react'
import { useEngine } from '../hooks/useEngine'
import { engine } from '../engine/store'
import { PEAK_BUCKETS } from '../engine/analysis'
import { fmtClock } from '../engine/format'

type DragMode = 'sel' | 'moveA' | 'moveB' | null

interface DragState {
  mode: DragMode
  startT: number
  moved: boolean
  pointerId: number
}

const RULER_STEPS = [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600, 7200]

function pickStep(pxPerSec: number): number {
  for (const s of RULER_STEPS) {
    if (s * pxPerSec >= 72) return s
  }
  return RULER_STEPS[RULER_STEPS.length - 1]
}

export function Waveform(): JSX.Element | null {
  const { session, gaps, settings, excludedGaps, hoverGap } = useEngine()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const headRef = useRef<HTMLDivElement | null>(null)
  const hoverRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const rafRef = useRef<number | null>(null)
  const [viewTick, setViewTick] = useState(0)
  const view = useRef<[number, number]>([0, 1])

  const dur = session?.durationSec ?? 1
  const sel = settings.sel
  useEffect(() => {
    view.current = [0, dur]
    setViewTick((v) => v + 1)
  }, [dur, session?.itemId])

  // coalesced redraw
  const drawRef = useRef<() => void>(() => undefined)
  const requestDraw = (): void => {
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      drawRef.current()
    })
  }

  drawRef.current = useMemo(() => {
    return (): void => {
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      const s = session
      if (!canvas || !wrap || !s) return

      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const [t0, t1] = view.current
      const span = Math.max(1e-6, t1 - t0)
      const xOf = (t: number): number => ((t - t0) / span) * w
      const tOf = (x: number): number => t0 + (x / w) * span

      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#0d1017'
      ctx.fillRect(0, 0, w, h)

      const midY = h * 0.46
      const amp = h * 0.72
      const pxPerSec = w / span

      // silence shading (behind waveform); user-kept gaps render hollow
      const excluded = new Set(excludedGaps)
      for (const [a, b] of gaps) {
        const x0 = xOf(Math.max(a, t0))
        const x1 = xOf(Math.min(b, t1))
        if (x1 < 0 || x0 > w) continue
        const key = Math.round(a * 1000)
        const isExcluded = excluded.has(key)
        const isHover = hoverGap === key
        if (isExcluded) {
          ctx.strokeStyle = isHover ? 'rgba(255,93,93,0.75)' : 'rgba(255,93,93,0.30)'
          ctx.beginPath()
          ctx.moveTo(x0 + 0.5, 8)
          ctx.lineTo(x0 + 0.5, h - 32)
          ctx.lineTo(x1 - 0.5, h - 32)
          ctx.lineTo(x1 - 0.5, 8)
          ctx.stroke()
        } else {
          ctx.fillStyle = isHover ? 'rgba(255,93,93,0.20)' : 'rgba(255,93,93,0.10)'
          ctx.fillRect(x0, 8, x1 - x0, h - 32)
        }
        ctx.fillStyle = 'rgba(255,93,93,0.45)'
        ctx.fillRect(x0, 8, 1, h - 32)
        ctx.fillRect(x1 - 1, 8, 1, h - 32)
      }

      // waveform
      ctx.strokeStyle = '#33405c'
      ctx.lineWidth = 1
      const peakMin = s.peakMin
      const peakMax = s.peakMax
      const bucketLen = s.durationSec / PEAK_BUCKETS
      ctx.beginPath()
      for (let x = 0; x < w; x += 1) {
        const ta = tOf(x)
        const tb = tOf(x + 1)
        const b0 = Math.max(0, Math.floor(ta / bucketLen))
        const b1 = Math.min(PEAK_BUCKETS - 1, Math.floor(Math.max(tb, ta + 0.001) / bucketLen))
        let lo = 0
        let hi = 0
        for (let b = b0; b <= b1; b++) {
          if (peakMax[b] > hi) hi = peakMax[b]
          if (peakMin[b] < lo) lo = peakMin[b]
        }
        const yTop = midY - hi * (amp / 2)
        const yBot = midY - lo * (amp / 2)
        ctx.moveTo(x + 0.5, Math.max(2, yTop))
        ctx.lineTo(x + 0.5, Math.min(h - 26, yBot))
      }
      ctx.stroke()

      // in-selection highlight
      if (sel) {
        const x0 = xOf(Math.max(sel[0], t0))
        const x1 = xOf(Math.min(sel[1], t1))
        if (x1 >= 0 && x0 <= w) {
          ctx.fillStyle = 'rgba(255,178,36,0.13)'
          ctx.fillRect(x0, 6, x1 - x0, h - 30)
          ctx.fillStyle = 'rgba(255,178,36,0.8)'
          ctx.fillRect(Math.max(0, x0 - 1), 6, 2, h - 30)
          ctx.fillRect(Math.min(w - 2, x1 - 1), 6, 2, h - 30)
        }
      }

      // ruler
      const step = pickStep(pxPerSec)
      ctx.fillStyle = 'rgba(151,160,179,0.55)'
      ctx.font = '10px ui-monospace, Consolas, monospace'
      ctx.textBaseline = 'bottom'
      for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
        const x = xOf(t)
        ctx.fillRect(x, h - 18, 1, 5)
        const label = fmtClock(t, dur >= 3600)
        ctx.fillText(label, x + 3, h - 4)
      }
    }
  }, [session, gaps, sel, dur, excludedGaps, hoverGap])

  useEffect(() => {
    requestDraw()
  }, [viewTick, session, gaps, sel, excludedGaps, hoverGap])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => requestDraw())
    ro.observe(wrap)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // playhead rAF
  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const head = headRef.current
      const a = engine.audio
      const s = session
      if (head && a && s) {
        const t = a.currentTime
        const [t0, t1] = view.current
        const frac = (t - t0) / Math.max(1e-6, t1 - t0)
        head.style.opacity = t >= t0 && t <= t1 ? '1' : '0'
        head.style.transform = `translateX(${(frac * 100).toFixed(3)}%)`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [session])

  const localT = (clientX: number): number => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
    const [t0, t1] = view.current
    return t0 + (x / rect.width) * (t1 - t0)
  }

  const clampSel = (a: number, b: number): [number, number] => [
    Math.max(0, Math.min(dur, Math.min(a, b))),
    Math.max(0, Math.min(dur, Math.max(a, b))),
  ]

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>): void => {
    const el = wrapRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    const t = localT(e.clientX)
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (sel) {
      const [t0, t1] = view.current
      const span = t1 - t0
      const xa = ((sel[0] - t0) / span) * rect.width
      const xb = ((sel[1] - t0) / span) * rect.width
      if (Math.abs(x - xa) < 9) dragRef.current = { mode: 'moveA', startT: sel[0], moved: true, pointerId: e.pointerId }
      else if (Math.abs(x - xb) < 9) dragRef.current = { mode: 'moveB', startT: sel[1], moved: true, pointerId: e.pointerId }
      else dragRef.current = { mode: 'sel', startT: t, moved: false, pointerId: e.pointerId }
    } else {
      dragRef.current = { mode: 'sel', startT: t, moved: false, pointerId: e.pointerId }
    }
  }

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>): void => {
    const t = localT(e.clientX)
    if (hoverRef.current) hoverRef.current.textContent = fmtClock(t, dur >= 3600)
    const d = dragRef.current
    if (!d) return
    if (d.mode === 'sel') {
      if (Math.abs(t - d.startT) > (dur / 600)) d.moved = true
      if (d.moved) engine.setSelection(clampSel(d.startT, t))
    } else if (d.mode === 'moveA' && sel) {
      engine.setSelection([Math.min(t, sel[1]), sel[1]])
    } else if (d.mode === 'moveB' && sel) {
      engine.setSelection([sel[0], Math.max(t, sel[0])])
    }
  }

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current
    dragRef.current = null
    wrapRef.current?.releasePointerCapture(e.pointerId)
    if (!d) return
    const t = localT(e.clientX)
    if (d.mode === 'sel' && !d.moved) {
      engine.seek(t)
      engine.setSelection(null)
    }
  }

  const onWheel = (e: RWheelEvent<HTMLDivElement>): void => {
    if (!session) return
    e.preventDefault()
    const t = localT(e.clientX)
    const [t0, t1] = view.current
    const span = t1 - t0
    const factor = e.deltaY < 0 ? 0.82 : 1 / 0.82
    const minSpan = Math.min(0.4, dur / 4)
    const newSpan = Math.min(dur, Math.max(minSpan, span * factor))
    const k = newSpan / span
    let a = t - (t - t0) * k
    if (a < 0) a = 0
    if (a + newSpan > dur) a = dur - newSpan
    view.current = [a, a + newSpan]
    setViewTick((v) => v + 1)
  }

  const onDoubleClick = (): void => {
    view.current = [0, dur]
    setViewTick((v) => v + 1)
  }

  if (!session) return null
  return (
    <div className="panel relative overflow-hidden lg:h-full lg:min-h-[256px] lg:flex-1">
      <div
        ref={wrapRef}
        className="relative h-40 w-full touch-pan-y sm:h-52 md:h-64 lg:h-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        role="img"
        aria-label="Waveform of the loaded file; drag to select a region"
        style={{ cursor: 'crosshair' }}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
        <div
          ref={headRef}
          className="pointer-events-none absolute top-1 bottom-7 left-0 w-0.5 bg-accent"
          style={{ transform: 'translateX(-100%)' }}
        />
        <div
          ref={hoverRef}
          className="num pointer-events-none absolute right-2 top-2 rounded-md bg-panel2/90 px-2 py-0.5 text-xs text-dim"
        >
          00:00:00
        </div>
      </div>
    </div>
  )
}
