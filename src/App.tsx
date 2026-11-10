import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { useEngine } from './hooks/useEngine'
import { engine } from './engine/store'
import { TopBar } from './components/TopBar'
import { BatchQueue } from './components/BatchQueue'
import { Dropzone } from './components/Dropzone'
import { Waveform } from './components/Waveform'
import { Transport } from './components/Transport'
import { PanelSilence } from './components/PanelSilence'
import { PanelSpeed } from './components/PanelSpeed'
import { ExportBar } from './components/ExportBar'
import { RecorderPanel } from './components/RecorderPanel'
import { HistoryDrawer } from './components/HistoryDrawer'
import { ShortcutsModal } from './components/ShortcutsModal'
import { Toaster } from './components/Toaster'

export default function App(): JSX.Element {
  const { stage } = useEngine()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [keys, setKeys] = useState(false)

  useEffect(() => {
    if (audioRef.current) engine.registerAudio(audioRef.current)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        setDrawer(false)
        setKeys(false)
        return
      }
      if (e.key === '?') {
        setKeys((v) => !v)
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) engine.redo()
        else engine.undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        engine.redo()
        return
      }
      const a = engine.audio
      const s = engine.getSnapshot().session
      if (!a || !s) return
      if (e.code === 'Space') {
        e.preventDefault()
        engine.togglePlay()
      } else if (e.code === 'ArrowLeft') {
        engine.seek(a.currentTime - 5)
      } else if (e.code === 'ArrowRight') {
        engine.seek(a.currentTime + 5)
      } else if (e.code === 'KeyI') {
        const now = engine.getSnapshot().settings.sel
        engine.setSelection([a.currentTime, now?.[1] ?? s.durationSec])
      } else if (e.code === 'KeyO') {
        const now = engine.getSnapshot().settings.sel
        engine.setSelection([now?.[0] ?? 0, a.currentTime])
      } else if (e.code === 'KeyL') {
        engine.setSelection(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // global drag & drop (whole window)
  useEffect(() => {
    const over = (e: DragEvent): void => e.preventDefault()
    const drop = (e: DragEvent): void => {
      e.preventDefault()
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        engine.addFiles(e.dataTransfer.files)
      }
    }
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return (
    <div className="flex h-screen flex-col bg-bg">
      <TopBar onHistory={() => setDrawer(true)} onShortcuts={() => setKeys(true)} />
      {stage !== 'idle' && (
        <div className="border-b border-edge px-3 pb-2 pt-2">
          <BatchQueue />
        </div>
      )}
      <main className="min-h-0 flex-1 overflow-y-auto p-3 lg:overflow-hidden">
        {stage === 'ready' || stage === 'exporting' ? (
          <div className="grid grid-cols-1 gap-3 lg:h-full lg:grid-cols-[290px_minmax(0,1fr)]">
            <div className="order-2 flex flex-col gap-3 lg:order-1 lg:overflow-y-auto lg:pr-0.5">
              <PanelSilence />
              <PanelSpeed />
            </div>
            <div className="order-1 flex min-h-0 flex-col gap-3 lg:order-2">
              <Waveform />
              <Transport />
              <ExportBar />
            </div>
          </div>
        ) : (
          <Dropzone />
        )}
      </main>
      <audio ref={audioRef} preload="auto" className="hidden" />
      <RecorderPanel />
      {drawer && <HistoryDrawer onClose={() => setDrawer(false)} />}
      {keys && <ShortcutsModal onClose={() => setKeys(false)} />}
      <Toaster />
    </div>
  )
}
