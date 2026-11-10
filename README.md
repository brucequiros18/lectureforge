# LectureForge

Cut the silence out of lecture recordings, change the speed without chipmunks, and export MP3/WAV — **entirely in your browser**. Your audio never leaves your device: there is no server, no upload, no account.

## Why

A typical one-hour lecture has 10–15 minutes of dead air: people walking in, the speaker thinking, shuffling papers. LectureForge finds that silence, hands you the scissors, and rebuilds a tighter recording.

## What it does

| | |
|---|---|
| **Cut silence** | Automatic gap detection with adjustable threshold, minimum gap length, and silence padding. Every cut is visible on the waveform and individually reviewable — keep any gap (laugh breaks, questions) with one click. |
| **Change speed** | 0.5×–4× with pitch preserved (WSOLA time-stretch at full seek quality for exports). |
| **Convert** | Export MP3 (128/192/256/320 kbps) or 16-bit WAV. |
| **Preview** | Play with "skip silence" mode; the play jump-cuts only the gaps you marked for removal. |
| **Batch** | Queue many recordings; every list item keeps its own state while you work through it. |
| **Record** | Capture straight from the mic after a short level-check countdown. |
| **History** | Recent exports (before/after duration) in a drawer, stored locally via IndexedDB. |
| **Offline** | Installable PWA — works with no connection after first load. |

## Privacy model

- Audio decoding, analysis, splicing, stretching and encoding all run via Web Workers on your machine.
- The network is never touched after the first page load: no analytics, no telemetry, no requests.
- Settings and export history persist in IndexedDB; recordings themselves are never persisted.

## How it works

```
File ──decode──▶ ▉▉▉ 44.1kHz stereo PCM
                      │  (has silence + speed changed?)
                      ▼
            mono 16 kHz box-decimate          (Analysis Worker)
                      │
            RMS frames @128ms ──detect──▶ gap list
                      │                    │
                      │           8ms evidence windows
                      │           refine cut edges (sub-frame)
                      ▼
        sample-level splice ──▶ SoundTouch (WSOLA, offline quality)
                                   │  .tempo = speed, quickSeek off
                                   ▼
                        lamejs (MP3) / manual WAV writer
```

- **Sub-frame cuts:** the frame meter is a 128 ms grid; `refineGaps` (src/engine/silence.ts) scans 8 ms RMS windows around each edge to find where speech actually ends, then re-places the cut exactly `padSec` of proven silence away from it. Cuts stay natural, never clipped.
- **No audio-tail loss:** SoundTouchJS's `SimpleFilter` silently drops the last input window when the source runs dry. The stretch runs through a zero-padded virtual source and the output is trimmed to the exact `⌊N/speed⌋` length (src/engine/stretch.ts).
- **Whole-file guard:** if not a single frame reads as speech (threshold absurdly high), cutting is disabled instead of shredding the file.
- **Worker stretch:** big exports process on a worker via zero-copy transfer (splice buffers out, interleaved result back) — the main thread stays at 60fps.

## Files

```
src/
  engine/
    analysis.ts   pure math: decimation, RMS frames, bucket peaks
    silence.ts    gap detection, refinement, keep-segment plan
    splicer.ts    sample-level assembly of keep segments
    stretch.ts    SoundTouch runner (sync + async + padded source)
    encode.ts     WAV writer + lazy lamejs MP3 (chunked, cancellable)
    loader.ts     decode + worker session management + protocol types
    store.ts      EngineStore: single external store for the whole app
    format.ts     naming/formatting helpers (pure, tested)
  workers/
    analysis.worker.ts  owns the 16 kHz mono copy; RMS + peaks + refine + stretch
  components/     Dropzone, Waveform, Transport, PanelSilence (+GapList),
                  PanelSpeed, ExportBar, BatchQueue, RecorderPanel,
                  HistoryDrawer, ShortcutsModal, Toaster, TopBar, Icon
```

## Keyboard

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `S` | Toggle skip-silence preview |
| `E` | Export |
| `Esc` | Close panels / clear selection |
| `?` | Shortcut overlay |

## Scripts

```bash
npm run dev      # vite dev server (localhost:5173)
npm run build    # typecheck + production build (PWA service worker)
npm run preview  # serve the dist/ build
npm run lint     # oxlint
npm test         # engine unit tests (node --test, 22 tests)
```

## Browser support

Chrome, Edge, Firefox 114+ and Safari 15+ (module workers). The recorder prefers WebM/Opus and falls back to MP4/OGG depending on the platform. Files larger than 220 MB decode at 22.05 kHz to halve peak memory (listeners only lose frequencies above 11 kHz, which lectures don't have).

## Stack

React · TypeScript · Tailwind CSS 4 · Vite + vite-plugin-pwa · soundtouchjs · @breezystack/lamejs (lazy-loaded on first MP3 export) · idb
