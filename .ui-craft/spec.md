# Spec — Surface: Editor (single screen app)

## Shape: Step 1 — Clarify answers (extracted from user Q&A)
- Primary action: **Drop/record a lecture, then export a condensed version.**
- Visible by default: file stage (dropzone→waveform), transport, silence controls, speed presets, export bar. Hidden: batch queue (appears >1 file), history (drawer), recorder (ARM button → inline panel).
- Success: export completes → file auto-downloads + toast with before/after duration stats.
- Primary user: desktop-first power-ish user; mobile must not break.

## Step 2 — Content inventory
- **P0** Stage (dropzone idle | waveform+transport ready) — the entire product
- **P0** Silence panel: threshold slider, min-gap slider, keep-padding slider, live "gaps found / time saved"
- **P0** Export bar: format (MP3/WAV), bitrate, PRIMARY export CTA with before→after duration
- **P1** Speed panel: presets 1×/1.25/1.5/1.75/2/2.5 + fine slider, pitch-preserve label
- **P1** Transport: play/pause, skip ±5s, A-B loop toggle, selection readouts (mono numerals)
- **P1** Batch queue chips (when >1 file), each with status (waiting/ready/error)
- **P1** Recorder: REC ARM button → countdown → live timer → stop → loads as file
- **P2** History drawer (recent sessions, settings), keyboard shortcuts cheat ( "?" )
- **P2** App name + offline/installable status chip

## Step 3 — ASCII layout
Desktop:
```
┌──────────────────────────────────────────────────────────────────────┐
│ [◆ LectureForge]      [batch chips]                  [rec●] [⌘?]    │
├──────────────┬───────────────────────────────────────────────────────┤
│ SILENCE      │  ┌─────────────────────────────────────────────────┐  │
│  threshold ▬▬│  │ WAVEFORM canvas (region select, A-B loop band,  │  │
│  min-gap  ▬▬ │  │ cut markers, playhead, zoom; hover time readout)│  │
│  padding  ▬▬ │  └─────────────────────────────────────────────────┘  │
│  18 gaps · -12m│  [⏮] [▶] [⏭] [↻loop]      00:12:34 / 01:31:02       │
│ SPEED        ├───────────────────────────────────────────────────────┤
│  1× 1.25 1.5…│  Out: MP3 192k ▾   [PREVIEW CUT] [EXPORT ▶ 1h12m→41m] │
│  fine slider ├────────────────────────────────────────────────────────┤
│ EXPORT       │  footer status: offline-ready · engine idle            │
├──────────────┴────────────────────────────────────────────────────────┤
```
Mobile:
```
┌────────────────────┐
│ [◆]         [rec●] │
├────────────────────┤
│  (file chip)       │
│ ┌────────────────┐ │
│ │   waveform     │ │
│ └────────────────┘ │
│ [▶]  00:12 / 1:31  │
│ ▸ Silence  (18·-12m)│
│ ▸ Speed   (1.5×)   │
│ [ EXPORT  1h12→41m]│
└────────────────────┘
```

## Step 4 — State list
- **idle** (required): dropzone hero; format list; recorder CTA; supports drag+drop + file picker
- **loading** (required): decode progress (file size based bar + stage label); skeleton mirrors editor shell
- **ready** (required): editor as laid out; defaults applied (auto silence pass after decode)
- **exporting** (required): overlay bar with real chunk progress + cancel; controls disabled
- **done** (required): toast success with before→after; P0 (persistent summary strip until next edit)
- **error-decode** (required): named cause + supported-format list + retry picker
- **error-permission** (required): recorder denied → inline instructions, no dead-end
- **partial** (required if batch): per-file error chips; successful files proceed anyway
- **offline** (required, PWA): app fully functional; status chip only (no blocking UI)
- **conflict / empty-data**: N/A (no collaborative data)

## Step 5 — Open questions — resolved by Q&A
- Accent: amber (#FFB224) on near-black; semantic green/red for saved/cut — no default-blue.
- Typography: system-ui stack (offline-first, no webfonts); ui-monospace + tabular-nums for all time/size numerals.
- Breakpoints: ≥360px mobile must render; 768px switches to two-column.
- Stack: React+Vite+TS+Tailwind v4; audio work done in Web Workers; no animation lib (CSS transitions + rAF playhead).
- Data: local only (IndexedDB for settings/history metadata).

## Motion shape (CRAFT 7)
- Enter: dropzone → editor shell fades/slides up 200ms; panels stagger 30ms
- Waveform: no enter animation (data density) — playhead is the only constant-motion element (rAF, transform only)
- State changes: buttons 100ms scale/press; toasts slide-in 200ms, auto-dismiss 3.5s; overlay progress 350ms ease-out

## Typography hierarchy
- Display (app name, big stats): 700 weight, tabular where numeric — 20–28px
- Time readouts: ui-monospace, 13–14px, tabular-nums — the visual spine of the app
- Labels: 11–12px uppercase tracking 0.06em muted
- Body: 14px, 1.5 rhythm; never below 12px
