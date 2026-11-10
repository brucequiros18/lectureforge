/**
 * EngineStore — single source of truth for the app, exposed as an
 * external store (useSyncExternalStore). All audio work routes through here.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  createAnalysisWorker,
  decodeNative,
  requestSilencePlan,
  streamAnalysis,
  DEFAULT_SILENCE,
  type SilenceParamsUi,
  type WorkerInbound,
} from './loader.ts'
import {
  buildKeepSegments,
  gapAt,
  gapKeyOf,
  gapStats,
  enabledGaps,
  addGapRange,
  removeGapByKey,
  secToFrame,
  type Range,
} from './silence.ts'
import { spliceInto, spliceLength, type Seg } from './splicer.ts'
import { stretchPairAsync } from './stretch.ts'
import { encodeAudio, type EncFormat } from './encode.ts'
import { normalizeLoudness } from './normalize.ts'
import { buildExportName, downloadBlob, fmtBytes, fmtSaved } from './format.ts'

export type Stage = 'idle' | 'loading' | 'ready' | 'exporting'
export type RecState = 'off' | 'countdown' | 'recording'
export type BatchStatus = 'waiting' | 'loading' | 'ready' | 'error'
export type GapMode = 'auto' | 'manual'

export interface Toast {
  id: number
  kind: 'ok' | 'err' | 'info'
  msg: string
  detail?: string
}

export interface BatchItem {
  id: number
  name: string
  size: number
  file: File
  kind: 'file' | 'recording'
  status: BatchStatus
  error: string | null
}

export interface Session {
  itemId: number
  buffer: AudioBuffer
  url: string
  durationSec: number
  nativeRate: number
  lowMemory: boolean
  sizeBytes: number
  peakMin: Float32Array
  peakMax: Float32Array
}

export interface Settings {
  silence: SilenceParamsUi
  speed: number
  format: EncFormat
  kbps: number
  normalize: boolean
  skipSilencePreview: boolean
  sel: Range | null
}

export interface HistoryEntry {
  id: number
  name: string
  at: number
  beforeSec: number
  afterSec: number
  format: string
}

/** Undo/redo snapshot of the user-editable gap state. */
interface GapSnapshot {
  gaps: Range[]
  excludedGaps: number[]
  deletedGaps: number[]
}

const GAP_HISTORY_LIMIT = 50
const MIN_MANUAL_GAP_SEC = 0.05

export interface EngineState {
  stage: Stage
  loading: { f: number; label: string } | null
  exportProgress: { f: number; label: string } | null
  items: BatchItem[]
  activeId: number | null
  session: Session | null
  settings: Settings
  /** Auto = silence detection drives the list; manual = hand-edited. */
  gapMode: GapMode
  /** Effective working gap list (shown and used for the export). */
  gaps: Range[]
  /** Gap keys (rounded start ms) the user kept in the export. */
  excludedGaps: number[]
  /** Gap keys permanently removed from the list (survives auto recomputes). */
  deletedGaps: number[]
  /** Gap key currently hovered from the gap list, for waveform highlighting. */
  hoverGap: number | null
  stats: { count: number; removedSec: number }
  canUndo: boolean
  canRedo: boolean
  playing: boolean
  recState: RecState
  recCount: number
  recSec: number
  recTranscript: string
  history: HistoryEntry[]
  toasts: Toast[]
  online: boolean
}

const initial: EngineState = {
  stage: 'idle',
  loading: null,
  exportProgress: null,
  items: [],
  activeId: null,
  session: null,
  settings: {
    silence: { ...DEFAULT_SILENCE },
    speed: 1,
    format: 'mp3',
    kbps: 128,
    normalize: false,
    skipSilencePreview: false,
    sel: null,
  },
  gapMode: 'auto',
  gaps: [],
  excludedGaps: [],
  deletedGaps: [],
  hoverGap: null,
  stats: { count: 0, removedSec: 0 },
  canUndo: false,
  canRedo: false,
  playing: false,
  recState: 'off',
  recCount: 0,
  recSec: 0,
  recTranscript: '',
  history: [],
  toasts: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
}

interface StoreDb extends DBSchema {
  kv: { key: string; value: unknown }
  history: { key: number; value: HistoryEntry }
}

let dbPromise: Promise<IDBPDatabase<StoreDb>> | null = null
function db(): Promise<IDBPDatabase<StoreDb>> {
  dbPromise ??= openDB<StoreDb>('lectureforge', 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv')
      if (!d.objectStoreNames.contains('history')) {
        d.createObjectStore('history', { keyPath: 'id', autoIncrement: true })
      }
    },
  })
  return dbPromise
}

function packGaps(flat: number[]): Range[] {
  const out: Range[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    if (flat[i + 1] > flat[i]) out.push([flat[i], flat[i + 1]])
  }
  return out
}

/**
 * Gap re-identification across recomputes: an excluded key survives a
 * threshold change when its gap's start moved by at most 150 ms; the key
 * is updated in place so the user's review sticks to the same gap.
 */
function matchExcluded(gaps: Range[], prevKeys: readonly number[]): number[] {
  const tolSec = 0.15
  const keys: number[] = []
  for (const oldKey of prevKeys) {
    const oldSec = oldKey / 1000
    let best = -1
    let bestDist = Infinity
    for (let i = 0; i < gaps.length; i++) {
      const d = Math.abs(gaps[i][0] - oldSec)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    if (best >= 0 && bestDist <= tolSec) keys.push(gapKeyOf(gaps[best]))
  }
  return [...new Set(keys)].sort((a, b) => a - b)
}

function decodeError(raw: string): string {
  if (raw === 'DECODE_EMPTY') return 'The file decoded to zero frames — it may be corrupt.'
  if (/decodeAudioData|EncodingError/i.test(raw)) {
    return 'Unsupported or corrupt audio. Supported: MP3, WAV, M4A, OGG, FLAC, WebM.'
  }
  return raw
}

const yieldTick = () => new Promise<void>((r) => setTimeout(r, 0))

const REC_MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

export class EngineStore {
  private state = initial
  private listeners = new Set<() => void>()
  private worker: Worker | null = null
  private workerId = 0
  private toastSeq = 1
  private itemSeq = 1
  private stopFlag = false
  private recStream: MediaStream | null = null
  private rec: MediaRecorder | null = null
  private recTimer: ReturnType<typeof setInterval> | null = null
  private recCancelFlag = false
  private recSpeech: SpeechRecognitionLike | null = null
  private recSpeechWanted = false
  private recFinalText = ''
  private rafId: number | null = null
  private booted = false
  private gapUndo: GapSnapshot[] = []
  private gapRedo: GapSnapshot[] = []
  private stretchPending: {
    id: number
    resolve: (out: Float32Array) => void
    reject: (err: Error) => void
    report: (frac: number) => void
  } | null = null
  private stretchActive = false
  audio: HTMLAudioElement | null = null

  getSnapshot = (): EngineState => this.state

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => void this.listeners.delete(cb)
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }

  private set(patch: Partial<EngineState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  /* ── toasts ────────────────────────────────────────────────────────── */

  toast(kind: Toast['kind'], msg: string, detail?: string): void {
    const t: Toast = { id: this.toastSeq++, kind, msg, detail }
    this.set({ toasts: [...this.state.toasts.slice(-3), t] })
    const ttl = kind === 'err' ? 7000 : 3500
    setTimeout(() => {
      this.set({ toasts: this.state.toasts.filter((x) => x.id !== t.id) })
    }, ttl)
  }

  dismissToast(id: number): void {
    this.set({ toasts: this.state.toasts.filter((x) => x.id !== id) })
  }

  /* ── settings ──────────────────────────────────────────────────────── */

  setSilence(patch: Partial<SilenceParamsUi>): void {
    const silence = { ...this.state.settings.silence, ...patch }
    this.set({ settings: { ...this.state.settings, silence } })
    void this.persistSettings()
    if (this.worker && this.state.gapMode === 'auto') {
      requestSilencePlan(this.worker, this.workerId, silence)
    }
  }

  setSpeed(speed: number): void {
    this.set({ settings: { ...this.state.settings, speed } })
    void this.persistSettings()
    if (this.audio) {
      this.audio.playbackRate = speed
      setPreservesPitch(this.audio, true)
    }
  }

  setFormat(format: EncFormat): void {
    this.set({ settings: { ...this.state.settings, format } })
    void this.persistSettings()
  }

  setKbps(kbps: number): void {
    this.set({ settings: { ...this.state.settings, kbps } })
    void this.persistSettings()
  }

  setNormalize(on: boolean): void {
    this.set({ settings: { ...this.state.settings, normalize: on } })
    void this.persistSettings()
  }

  setSkipSilencePreview(on: boolean): void {
    this.set({ settings: { ...this.state.settings, skipSilencePreview: on } })
    void this.persistSettings()
  }

  setSelection(sel: Range | null): void {
    const norm: Range | null =
      sel === null ? null : [Math.min(sel[0], sel[1]), Math.max(sel[0], sel[1])]
    this.set({ settings: { ...this.state.settings, sel: norm } })
  }

  /* ── per-gap review ────────────────────────────────────────────────── */

  toggleGap(key: number): void {
    this.pushGapHistory()
    const set = new Set(this.state.excludedGaps)
    if (set.has(key)) set.delete(key)
    else set.add(key)
    this.applyExclusions([...set].sort((a, b) => a - b))
  }

  /** Add every gap shorter than `maxSec` (no-op toggle: merges). */
  excludeShortGaps(maxSec: number): void {
    this.pushGapHistory()
    const set = new Set(this.state.excludedGaps)
    for (const g of this.state.gaps) {
      if (g[1] - g[0] < maxSec) set.add(gapKeyOf(g))
    }
    this.applyExclusions([...set].sort((a, b) => a - b))
  }

  includeAllGaps(): void {
    this.pushGapHistory()
    this.applyExclusions([])
  }

  setHoverGap(key: number | null): void {
    if ((this.state.hoverGap ?? -1) !== (key ?? -1)) this.set({ hoverGap: key })
  }

  /** Switch Auto (detection-driven) ↔ Manual (hand-edited). Boundary action. */
  setGapMode(mode: GapMode): void {
    if (this.state.gapMode === mode) return
    this.gapUndo = []
    this.gapRedo = []
    this.set({ gapMode: mode, canUndo: false, canRedo: false })
    if (mode === 'auto' && this.worker) {
      requestSilencePlan(this.worker, this.workerId, this.state.settings.silence)
    }
  }

  /**
   * Permanently remove a gap from the list and the export. In Auto mode the
   * key is remembered so the gap stays gone across recomputes.
   */
  deleteGap(key: number): void {
    this.pushGapHistory()
    const gaps = removeGapByKey(this.state.gaps, key)
    const excluded = this.state.excludedGaps.filter((k) => k !== key)
    const deleted = [...new Set([...this.state.deletedGaps, key])].sort((a, b) => a - b)
    this.applyGaps(gaps, excluded, deleted)
  }

  /** Add a manually drawn gap (Manual mode). Clamped, merged, no tiny slivers. */
  addGap(a: number, b: number): void {
    const s = this.state.session
    if (!s) return
    const dur = s.durationSec
    const lo = Math.max(0, Math.min(dur, Math.min(a, b)))
    const hi = Math.max(0, Math.min(dur, Math.max(a, b)))
    if (hi - lo < MIN_MANUAL_GAP_SEC) {
      this.toast('info', 'Gap too short', 'Drag a wider region on the waveform.')
      return
    }
    this.pushGapHistory()
    if (this.state.gapMode === 'auto') this.set({ gapMode: 'manual' })
    const gaps = addGapRange(this.state.gaps, [lo, hi])
    const excluded = this.state.excludedGaps.filter((k) => !gaps.some((g) => gapKeyOf(g) === k))
    const deleted = this.state.deletedGaps.filter((k) => k < lo * 1000 - 1 || k > hi * 1000 + 1)
    this.applyGaps(gaps, excluded, deleted)
    // The drawn region was only meant to specify the gap — do not let it
    // silently become the export trim region.
    this.set({ settings: { ...this.state.settings, sel: null } })
  }

  undo(): void {
    const prev = this.gapUndo.pop()
    if (!prev) return
    this.gapRedo.push(this.snapshotGaps())
    this.restoreGaps(prev)
  }

  redo(): void {
    const next = this.gapRedo.pop()
    if (!next) return
    this.gapUndo.push(this.snapshotGaps())
    this.restoreGaps(next)
  }

  private snapshotGaps(): GapSnapshot {
    return {
      gaps: this.state.gaps.map((g): Range => [g[0], g[1]]),
      excludedGaps: [...this.state.excludedGaps],
      deletedGaps: [...this.state.deletedGaps],
    }
  }

  private restoreGaps(snap: GapSnapshot): void {
    const gaps = snap.gaps.map((g): Range => [g[0], g[1]])
    this.set({
      gaps,
      excludedGaps: [...snap.excludedGaps],
      deletedGaps: [...snap.deletedGaps],
      stats: gapStats(enabledGaps(gaps, snap.excludedGaps)),
      canUndo: this.gapUndo.length > 0,
      canRedo: this.gapRedo.length > 0,
    })
  }

  private pushGapHistory(): void {
    this.gapUndo.push(this.snapshotGaps())
    if (this.gapUndo.length > GAP_HISTORY_LIMIT) this.gapUndo.shift()
    this.gapRedo = []
  }

  private applyExclusions(keys: number[]): void {
    this.applyGaps(this.state.gaps, keys, this.state.deletedGaps)
  }

  private applyGaps(gaps: Range[], excluded: number[], deleted: number[]): void {
    const enabled = enabledGaps(gaps, excluded)
    this.set({
      gaps,
      excludedGaps: excluded,
      deletedGaps: deleted,
      stats: gapStats(enabled),
      canUndo: this.gapUndo.length > 0,
      canRedo: this.gapRedo.length > 0,
    })
  }

  async clearHistory(): Promise<void> {
    try {
      const d = await db()
      await d.clear('history')
      this.set({ history: [] })
      this.toast('info', 'History cleared')
    } catch {
      this.set({ history: [] })
    }
  }

  private async persistSettings(): Promise<void> {
    try {
      const d = await db()
      await d.put('kv', { ...this.state.settings, sel: null }, 'settings')
    } catch {
      /* storage unavailable (private mode) — settings stay session-only */
    }
  }

  /* ── boot ──────────────────────────────────────────────────────────── */

  async boot(): Promise<void> {
    if (this.booted) return
    this.booted = true
    try {
      const d = await db()
      const saved = (await d.get('kv', 'settings')) as Settings | undefined
      if (saved) {
        this.set({
          settings: {
            ...this.state.settings,
            format: saved.format ?? 'mp3',
            speed: saved.speed ?? 1,
            kbps: saved.kbps ?? 128,
            normalize: saved.normalize ?? false,
            skipSilencePreview: saved.skipSilencePreview ?? false,
            silence: { ...DEFAULT_SILENCE, ...(saved.silence ?? {}) },
            sel: null,
          },
        })
      }
      const all = (await d.getAll('history')) as HistoryEntry[]
      all.sort((a, b) => b.id - a.id)
      this.set({ history: all })
    } catch {
      /* offline / private mode: continue without persistence */
    }
    window.addEventListener('online', () => this.set({ online: true }))
    window.addEventListener('offline', () => this.set({ online: false }))
  }

  /* ── worker lifecycle ──────────────────────────────────────────────── */

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = createAnalysisWorker()
      this.worker.addEventListener('message', (ev: MessageEvent<WorkerInbound>) => {
        const m = ev.data
        if (m.type === 'gaps' && m.id === this.workerId && m.gaps && m.stats) {
          if (this.state.gapMode !== 'auto') return
          const fresh = packGaps(m.gaps)
          const excluded = matchExcluded(fresh, this.state.excludedGaps)
          const deleted = matchExcluded(fresh, this.state.deletedGaps)
          const deletedSet = new Set(deleted)
          const gaps = fresh.filter((g) => !deletedSet.has(gapKeyOf(g)))
          this.set({
            gaps,
            excludedGaps: excluded,
            deletedGaps: deleted,
            stats: gapStats(enabledGaps(gaps, excluded)),
          })
        } else if (m.type === 'stretchProgress' && this.stretchPending && this.stretchPending.id === m.id) {
          this.stretchPending.report(Math.max(0, Math.min(1, m.f ?? 0)))
        } else if (m.type === 'stretchDone' && this.stretchPending && this.stretchPending.id === m.id) {
          const p = this.stretchPending
          this.stretchPending = null
          this.stretchActive = false
          if (m.out && !m.canceled) p.resolve(m.out)
          else p.reject(new Error('STRETCH_CANCELED'))
        } else if (m.type === 'stretchError' && this.stretchPending && this.stretchPending.id === m.id) {
          const p = this.stretchPending
          this.stretchPending = null
          this.stretchActive = false
          p.reject(new Error(m.error ?? 'STRETCH_FAILED'))
        }
      })
      this.worker.addEventListener('error', (e) => {
        const p = this.stretchPending
        if (p) {
          this.stretchPending = null
          this.stretchActive = false
          p.reject(new Error(e.message || 'WORKER_LOST'))
        }
        this.toast('err', 'Waveform engine failed', e.message)
      })
    }
    return this.worker
  }

  private closeWorker(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    const p = this.stretchPending
    if (p) {
      this.stretchPending = null
      this.stretchActive = false
      p.reject(new Error('STRETCH_CANCELED'))
    }
  }

  /* ── files / batch ─────────────────────────────────────────────────── */

  addFiles(files: File[] | FileList): void {
    const list = Array.from(files)
    if (list.length === 0) return
    const items: BatchItem[] = list.map((f) => ({
      id: this.itemSeq++,
      name: f.name || 'Recording',
      size: f.size,
      file: f,
      kind: f.name ? 'file' : 'recording',
      status: 'waiting' as BatchStatus,
      error: null,
    }))
    this.set({ items: [...this.state.items, ...items] })
    void this.loadItem(items[0].id)
    if (items.length > 1) {
      this.toast('info', `${items.length} recordings queued`, 'Files are processed one at a time.')
    }
  }

  removeItem(id: number): void {
    const items = this.state.items.filter((x) => x.id !== id)
    this.set({ items })
    if (this.state.activeId === id) {
      this.unload()
      const next = items.find((x) => x.status !== 'error')
      if (next) void this.loadItem(next.id)
    }
  }

  selectItem(id: number): void {
    if (id !== this.state.activeId) void this.loadItem(id)
  }

  /** Retry a batch item whose load failed. */
  retryItem(id: number): void {
    this.set({
      items: this.state.items.map((x) =>
        x.id === id ? { ...x, status: 'waiting' as BatchStatus, error: null } : x,
      ),
    })
    void this.loadItem(id)
  }

  unload(): void {
    this.closeWorker()
    this.unloadSession()
    this.gapUndo = []
    this.gapRedo = []
    this.set({
      stage: 'idle',
      loading: null,
      gapMode: 'auto',
      gaps: [],
      excludedGaps: [],
      deletedGaps: [],
      hoverGap: null,
      stats: { count: 0, removedSec: 0 },
      canUndo: false,
      canRedo: false,
      activeId: null,
    })
  }

  private unloadSession(): void {
    const s = this.state.session
    if (s) URL.revokeObjectURL(s.url)
    if (this.audio) {
      try {
        this.audio.pause()
        this.audio.removeAttribute('src')
        this.audio.load()
      } catch {
        /* noop */
      }
    }
    this.set({ session: null, playing: false })
  }

  async loadItem(id: number): Promise<void> {
    if (this.state.stage === 'exporting') {
      this.toast('info', 'Export in progress', 'Wait for the export (or cancel it) before switching files.')
      return
    }
    const item = this.state.items.find((x) => x.id === id)
    if (!item || item.status === 'loading') return
    this.closeWorker()
    this.unloadSession()
    this.gapUndo = []
    this.gapRedo = []
    this.set({
      items: this.state.items.map((x) =>
        x.id === id
          ? { ...x, status: 'loading' as BatchStatus }
          : x.status === 'loading'
            ? { ...x, status: 'waiting' as BatchStatus }
            : x,
      ),
      activeId: id,
      stage: 'loading',
      loading: { f: 0.05, label: `Decoding ${item.name} (${fmtBytes(item.size)})` },
      gapMode: 'auto',
      gaps: [],
      excludedGaps: [],
      deletedGaps: [],
      hoverGap: null,
      canUndo: false,
      canRedo: false,
    })

    const wid = ++this.workerId
    try {
      const buffer = await decodeNative(item.file)
      this.set({ loading: { f: 0.25, label: 'Building waveform…' } })
      const w = this.ensureWorker()
      const done = await streamAnalysis(buffer, w, wid, (f) => {
        this.set({ loading: { f: 0.25 + f * 0.7, label: 'Building waveform…' } })
      })

      const session: Session = {
        itemId: id,
        buffer,
        url: URL.createObjectURL(item.file),
        durationSec: buffer.duration,
        nativeRate: buffer.sampleRate,
        lowMemory: item.size > 220 * 1024 * 1024,
        sizeBytes: item.size,
        peakMin: done.peakMin,
        peakMax: done.peakMax,
      }
      this.set({
        session,
        stage: 'ready',
        loading: null,
        settings: { ...this.state.settings, sel: null },
        items: this.state.items.map((x) => (x.id === id ? { ...x, status: 'ready' as BatchStatus } : x)),
      })
      requestSilencePlan(w, wid, this.state.settings.silence)
      if (this.audio) {
        this.audio.src = session.url
        this.audio.playbackRate = 1
        this.clearRaf()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const friendly = decodeError(msg)
      this.set({
        stage: 'idle',
        loading: null,
        items: this.state.items.map((x) =>
          x.id === id ? { ...x, status: 'error' as BatchStatus, error: friendly } : x,
        ),
      })
      this.toast('err', `Could not load ${item.name}`, friendly)
    }
  }

  /* ── playback ──────────────────────────────────────────────────────── */

  registerAudio(el: HTMLAudioElement): void {
    this.audio = el
    setPreservesPitch(el, true)
    el.addEventListener('play', () => {
      this.set({ playing: true })
      this.startRaf()
    })
    el.addEventListener('pause', () => {
      this.set({ playing: false })
      this.clearRaf()
    })
    el.addEventListener('ended', () => {
      this.set({ playing: false })
      this.clearRaf()
    })
  }

  togglePlay(): void {
    const a = this.audio
    const s = this.state.session
    if (!a || !s) return
    if (a.paused) {
      if (a.currentTime >= s.durationSec - 0.05) a.currentTime = 0
      void a.play().catch(() => this.toast('err', 'Playback failed'))
    } else {
      a.pause()
    }
  }

  seek(t: number): void {
    const a = this.audio
    const s = this.state.session
    if (!a || !s) return
    a.currentTime = Math.max(0, Math.min(s.durationSec - 0.05, t))
  }

  private clearRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private startRaf(): void {
    if (this.rafId !== null) return
    const loop = (): void => {
      const a = this.audio
      const s = this.state.session
      if (a && s && this.state.playing) {
        const sel = this.state.settings.sel
        if (sel && a.currentTime < sel[0]) a.currentTime = sel[0]
        else if (sel && a.currentTime >= sel[1] - 0.03) a.currentTime = sel[0]
        else if (this.state.settings.skipSilencePreview) {
          const g = gapAt(enabledGaps(this.state.gaps, this.state.excludedGaps), a.currentTime)
          if (g) a.currentTime = g[1]
        }
      }
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  /* ── recording ─────────────────────────────────────────────────────── */

  async recordArm(): Promise<void> {
    try {
      this.recStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.set({ recState: 'countdown', recCount: 3 })
      const tick = (n: number): void => {
        this.set({ recCount: n })
        if (n > 0) setTimeout(() => tick(n - 1), 900)
        else this.recordBegin()
      }
      setTimeout(() => tick(2), 900)
    } catch (err) {
      const name = err instanceof Error ? err.name : String(err)
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.toast(
          'err',
          'Microphone access denied',
          'Allow mic access in the browser site settings, then try REC again.',
        )
      } else {
        this.toast('err', 'Microphone unavailable', name)
      }
      this.set({ recState: 'off' })
    }
  }

  private recordBegin(): void {
    const stream = this.recStream
    if (!stream) return
    const mime = REC_MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const parts: Blob[] = []
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) parts.push(e.data)
    }
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      this.recStream = null
      this.rec = null
      if (this.recTimer) {
        clearInterval(this.recTimer)
        this.recTimer = null
      }
      const transcript = this.stopSpeechCaptions()
      if (!this.recCancelFlag) {
        const type = parts[0]?.type || mime || 'audio/webm'
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'
        const when = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const file = new File(parts, `Recording ${when}.${ext}`, { type })
        this.set({ recState: 'off', recSec: 0 })
        this.addFiles([file])
      } else {
        this.recCancelFlag = false
        this.set({ recState: 'off', recSec: 0 })
      }
      if (transcript) {
        void navigator.clipboard
          ?.writeText(transcript)
          .then(() => this.toast('info', 'Live transcript copied to clipboard'))
          .catch(() => this.toast('info', 'Transcript captured', transcript.slice(0, 140)))
      }
    }
    rec.start(1000)
    this.rec = rec
    this.set({ recState: 'recording', recSec: 0, recTranscript: '' })
    this.recTimer = setInterval(() => {
      this.set({ recSec: this.state.recSec + 1 })
    }, 1000)
    this.startSpeechCaptions()
  }

  /** Live captions while recording — best-effort, Chrome/Edge/Safari only. */
  private startSpeechCaptions(): void {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Ctor) return
    let speech: SpeechRecognitionLike
    try {
      speech = new Ctor()
    } catch {
      return
    }
    this.recSpeechWanted = true
    this.recFinalText = ''
    speech.lang = navigator.language || 'en-US'
    speech.continuous = true
    speech.interimResults = true
    speech.onresult = (ev) => {
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i]
        const text = res[0]?.transcript ?? ''
        if (res.isFinal) this.recFinalText += text + ' '
        else interim += text
      }
      this.set({ recTranscript: (this.recFinalText + interim).trim() })
    }
    speech.onerror = () => {
      /* no-network / denied / aborted: captions silently unavailable */
    }
    speech.onend = () => {
      // Chrome ends the session on long silence — restart while recording
      if (this.recSpeechWanted && this.recSpeech === speech) {
        try {
          speech.start()
        } catch {
          this.recSpeech = null
        }
      }
    }
    try {
      speech.start()
      this.recSpeech = speech
    } catch {
      this.recSpeech = null
    }
  }

  private stopSpeechCaptions(): string {
    this.recSpeechWanted = false
    const s = this.recSpeech
    if (s) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
      this.recSpeech = null
    }
    return (this.recFinalText + (this.state.recTranscript ?? '')).trim()
  }

  recordStop(): void {
    if (this.rec && this.rec.state !== 'inactive') {
      if (this.recTimer) {
        clearInterval(this.recTimer)
        this.recTimer = null
      }
      this.rec.stop()
    }
  }

  recordCancel(): void {
    this.recCancelFlag = true
    this.recordStop()
  }

  /* ── export ────────────────────────────────────────────────────────── */

  async exportRun(): Promise<void> {
    const s = this.state.session
    if (!s || this.state.stage === 'exporting') return
    this.stopFlag = false
    const settings = this.state.settings
    const rate = s.nativeRate
    const dur = s.durationSec

    const sel = settings.sel ?? [0, dur]
    const selLen = Math.max(0, sel[1] - sel[0])
    if (selLen <= 0) return
    const enabled = enabledGaps(this.state.gaps, this.state.excludedGaps)
    const relGaps: Range[] = []
    for (const [a, b] of enabled) {
      const ga = Math.max(a, sel[0])
      const gb = Math.min(b, sel[1])
      if (gb > ga) relGaps.push([ga - sel[0], gb - sel[0]])
    }
    const keepRel = buildKeepSegments(relGaps, selLen)
    const frameSegs: Seg[] = []
    for (const [a, b] of keepRel) {
      frameSegs.push({
        start: secToFrame(sel[0] + a, dur, rate),
        end: secToFrame(sel[0] + b, dur, rate),
      })
    }
    const outFrames = spliceLength(frameSegs)
    if (outFrames === 0) {
      this.toast('info', 'Nothing to export', 'Raise the silence threshold or widen the trim region.')
      return
    }

    const speed = settings.speed
    const hasSpeed = Math.abs(speed - 1) > 1e-4
    const phases: { w: number; label: string }[] = []
    phases.push({ w: hasSpeed ? 0.2 : 0.3, label: 'Assembling trimmed audio' })
    if (hasSpeed) phases.push({ w: 0.45, label: 'Time-stretching (pitch preserved)' })
    if (settings.normalize) phases.push({ w: hasSpeed ? 0.08 : 0.1, label: 'Leveling loudness' })
    phases.push({
      w: 0,
      label: settings.format === 'mp3' ? 'Encoding MP3' : 'Writing WAV',
    })
    const usedW = phases.reduce((s, p) => s + p.w, 0)
    phases[phases.length - 1].w = Math.max(0.05, 1 - usedW)
    const totalW = phases.reduce((x, p) => x + p.w, 0)
    let phaseBase = 0
    let nextPhase = 1
    let report = (_frac: number): void => undefined
    const beginIdx = (idx: number): void => {
      let acc = 0
      for (let i = 0; i < idx; i++) acc += phases[i].w / totalW
      phaseBase = acc
      report = (frac: number) => {
        this.set({
          exportProgress: {
            f: Math.min(0.995, phaseBase + (phases[idx].w / totalW) * frac),
            label: phases[idx].label,
          },
        })
      }
    }

    this.set({ stage: 'exporting', exportProgress: { f: 0, label: phases[0].label } })
    const shouldStop = (): boolean => this.stopFlag

    try {
      /* Phase — splice into fresh channel buffers */
      beginIdx(0)
      const nCh = s.buffer.numberOfChannels
      const chans: Float32Array[] = []
      for (let c = 0; c < nCh; c++) chans.push(new Float32Array(outFrames))
      {
        let pos = 0
        let count = 0
        for (const seg of frameSegs) {
          for (let c = 0; c < nCh; c++) {
            const src = s.buffer.getChannelData(Math.min(c, nCh - 1))
            const view = chans[c].subarray(pos, pos + (seg.end - seg.start))
            spliceInto(src, [seg], view)
          }
          pos += seg.end - seg.start
          count++
          if (count % 12 === 0) {
            report(pos / outFrames)
            await yieldTick()
          }
          if (shouldStop()) throw new Error('STRETCH_CANCELED')
        }
        report(1)
      }

      /* Phase — optional pitch-preserving stretch (worker, transfers) */
      let left = chans[0]
      let right = nCh > 1 ? chans[1] : chans[0]
      let outLenFrames = outFrames
      if (hasSpeed) {
        beginIdx(nextPhase++)
        const interleaved = await this.stretchViaWorker(left, right, speed, (frac) => report(frac))
        outLenFrames = interleaved.length >> 1
        const nl = new Float32Array(outLenFrames)
        const nr = new Float32Array(outLenFrames)
        for (let i = 0; i < outLenFrames; i++) {
          nl[i] = interleaved[i * 2]
          nr[i] = interleaved[i * 2 + 1]
        }
        left = nl
        right = nr
        chans.length = 0 // splice buffers were transferred to the worker
      }

      /* Phase — optional loudness leveling */
      if (settings.normalize) {
        beginIdx(nextPhase++)
        await normalizeLoudness([left, right], {
          onProgress: (done, total) => report(total > 0 ? done / total : 0),
          shouldStop,
        })
      }

      /* Phase — encode */
      beginIdx(nextPhase)
      const blob = await encodeAudio({
        chans: [left, right],
        sampleRate: rate,
        format: settings.format,
        kbps: settings.kbps,
        onProgress: (done, total) => report(done / total),
        shouldStop,
      })

      const base =
        (this.state.items.find((x) => x.id === s.itemId)?.name ?? 'lecture')
      const name = buildExportName(base, enabled.length, speed, settings.format)
      downloadBlob(blob, name)

      const entry: HistoryEntry = {
        id: 0,
        name,
        at: Date.now(),
        beforeSec: dur,
        afterSec: outLenFrames / rate,
        format: settings.format.toUpperCase(),
      }
      await this.appendHistory(entry)
      this.set({ stage: 'ready', exportProgress: null })
      this.toast('ok', `Saved ${name}`, `${fmtSaved(dur - outLenFrames / rate)} shorter.`)
    } catch (err) {
      this.set({ stage: 'ready', exportProgress: null })
      const cancelled = err instanceof Error && /CANCELED/i.test(err.message)
      if (cancelled) this.toast('info', 'Export canceled')
      else {
        const msg = err instanceof Error ? err.message : String(err)
        this.toast('err', 'Export failed', msg)
      }
    }
  }

  cancelExport(): void {
    this.stopFlag = true
    if (this.stretchActive && this.worker) {
      this.worker.postMessage({ type: 'stretchCancel', id: this.workerId })
    }
  }

  /**
   * Route the stretch through the analysis worker. The splice channel
   * buffers transfer to the worker (zero-copy) and the interleaved result
   * transfers back — the main thread never holds two copies at once and
   * stays responsive at any file size.
   */
  private stretchViaWorker(
    left: Float32Array,
    right: Float32Array,
    speed: number,
    report: (frac: number) => void,
  ): Promise<Float32Array> {
    const w = this.ensureWorker()
    const id = this.workerId
    return new Promise<Float32Array>((resolve, reject) => {
      this.stretchPending = { id, resolve, reject, report }
      this.stretchActive = true
      try {
        w.postMessage(
          { type: 'stretch', id, speed, l: left, r: right },
          [left.buffer, right.buffer],
        )
      } catch {
        // Worker can't take the buffers → fall back to main-thread stretch.
        this.stretchPending = null
        this.stretchActive = false
        if (left.buffer.byteLength === 0 || right.buffer.byteLength === 0) {
          reject(new Error('STRETCH_CANCELED'))
          return
        }
        void stretchPairAsync(left, right, {
          speed,
          onProgress: (done, total) => report(total > 0 ? done / total : 0),
          shouldStop: () => this.stopFlag,
        }).then(resolve, reject)
      }
    })
  }

  private async appendHistory(entry: HistoryEntry): Promise<void> {
    try {
      const d = await db()
      await d.add('history', entry)
      const all = (await d.getAll('history')) as HistoryEntry[]
      all.sort((a, b) => b.id - a.id)
      this.set({ history: all })
    } catch {
      /* history unavailable — keep going */
    }
  }
}

function setPreservesPitch(el: HTMLAudioElement, v: boolean): void {
  const withFlags = el as HTMLAudioElement & {
    preservesPitch?: boolean
    webkitPreservesPitch?: boolean
  }
  try {
    withFlags.preservesPitch = v
    withFlags.webkitPreservesPitch = v
  } catch {
    /* older engines */
  }
}

export const engine = new EngineStore()
