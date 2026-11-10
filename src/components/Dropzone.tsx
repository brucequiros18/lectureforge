import { useState } from 'react'
import { useEngine } from '../hooks/useEngine'
import { engine } from '../engine/store'
import { IconMic, IconRec, IconScissors, IconUpload } from './Icon'
import type { JSX } from 'react'
import type { DragEvent as RDragEvent } from 'react'

const FORMATS = 'MP3 · M4A · WAV · OGG · FLAC · WebM'

export function Dropzone(): JSX.Element {
  const { loading } = useEngine()
  const [dragging, setDragging] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-6">
        <div className="w-full max-w-md">
          <div className="mb-2 flex justify-between text-xs text-dim">
            <span>{loading.label}</span>
            <span className="num">{Math.round(loading.f * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-edge">
            <div
              className="h-full rounded-full bg-accent transition-all duration-200"
              style={{ width: `${Math.max(4, loading.f * 100).toFixed(1)}%` }}
            />
          </div>
          <p className="mt-3 text-center text-xs text-faint">
            Large recordings take a few seconds — everything runs on your device.
          </p>
        </div>
      </div>
    )
  }

  const onDragOver = (e: RDragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragging(true)
  }
  const onDragLeave = (): void => setDragging(false)
  const onDrop = (e: RDragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragging(false)
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 py-4">
      <label
        htmlFor="file-input"
        className="group block w-full max-w-3xl cursor-pointer"
        draggable={false}
      >
        <input
          id="file-input"
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.oga,.flac,.webm,.opus,.aac,.wma"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) engine.addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <div
          className={`flex min-h-[380px] flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors duration-200 ${
            dragging
              ? 'border-accent bg-panel'
              : 'border-edge2 bg-panel/40 group-hover:border-accent/70 group-hover:bg-panel'
          }`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-panel2 text-accent ring-1 ring-edge2">
            <IconUpload size={30} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink">Drop a lecture recording</h2>
            <p className="mt-1 text-sm text-dim">or click to choose files · {FORMATS}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-faint">
            <span className="num flex items-center gap-1.5 rounded-full border border-edge px-3 py-1">
              <IconScissors size={13} /> cut silence
            </span>
            <span className="num flex items-center gap-1.5 rounded-full border border-edge px-3 py-1">
              <IconRec size={11} /> mp3 / wav out
            </span>
          </div>
          <p className="text-xs text-faint">
            Audio never leaves your device — no upload, no account.
          </p>
        </div>
      </label>
      <button
        className="btn btn-outline h-10 px-4"
        onClick={() => void engine.recordArm()}
        title="Record straight from your microphone"
      >
        <IconMic size={15} className="text-cut" />
        Record from your mic
      </button>
    </div>
  )
}
