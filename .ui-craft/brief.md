# Design Brief — LectureForge

## Product Purpose
A fully client-side web tool that loads lecture recordings, cuts silence, changes playback speed (pitch-preserved), and converts/exports as MP3 or WAV — all offline, private, free.

## Primary User
Students and lecturers who download or record lecture audio and want it condensed before listening/study. Desktop-first (large multihour files), but usable on mobile.

## Principles
1. **Privacy is structural** — audio never leaves the device; the network is only for the first page load. Any future feature that uploads audio gets rejected.
2. **The waveform is the interface** — every edit (region, cut points, speed) is visible on the canvas before it happens. No blind operations.
3. **Silence is waste** — silence-cutting is not an advanced feature buried in menus; it's the reason the product exists and the default path.
4. **Honest processing** — if the progress bar moves, bytes are actually moving. State what happened (sample rates, formats) in plain language.
5. **Keyboard-first, mouse-equal** — space/play, I/O region, loop, shortcuts everywhere; nothing reachable only by mouse.

## Success Metric
A user loads a 90-minute recording: drops it, previews the silence cut (count of gaps found + minutes saved), sets speed, exports MP3 — total elapsed under 5 minutes, zero network activity after page load, and the output file plays in any default player.

## Out of Scope
- No server, accounts, or cloud storage of any kind
- No audio editing beyond trim / silence-cut / speed (no EQ, filters, mixing)
- No transcription or captions
- No video support
- No library/playlist management — per-session work, lightweight history only
