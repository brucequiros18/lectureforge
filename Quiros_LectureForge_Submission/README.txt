LectureForge - Multimedia Final Project
=======================================
Student : Nash Bruce V. Quiros
Course  : BSCS-3 - Multimedia
School  : Tangub City Global College
Date    : November 4, 2026

CONTENTS
--------
Quiros_LectureForge_Documentation.docx  - full project report (5-part format)
Quiros_LectureForge_Documentation.pdf   - same report as PDF
Quiros_LectureForge_Presentation.pptx   - 7-slide presentation deck
Quiros_LectureForge_Presentation.pdf    - same deck as PDF
Quiros_LectureForge_Demo.mp4            - screen-recorded demo (~56 seconds)
Quiros_LectureForge_Demo-Subtitles.srt  - subtitle file for the demo
Quiros_LectureForge_Narration-Script.md - spoken script for the demo

NOTE ON THE DEMO AUDIO
----------------------
The demo video ships with a computer-generated (text-to-speech) voiceover
as a placeholder. The spoken lines are written in the narration script
included in this package. To use a real voice, record that script and
replace the audio.

WHAT THE APP DOES
-----------------
LectureForge is a web application that removes the silent parts from
lecture recordings, changes the speed without changing the pitch, and
exports MP3 or WAV. It runs entirely inside the browser: the audio is
never uploaded, and an internet connection is only needed for the first
page load.

HOW TO RUN IT
-------------
1. Open the project folder and install once:   npm install
2. Start the app:                              npm run dev
3. Open the address shown (usually http://localhost:5173) and drop in an
   audio file, or click "REC" to record from the microphone.

KEY TESTS (from the report)
---------------------------
- 105 MB / 10.4-minute lecture loads and is analysed in 2.3 seconds
- all 20 inserted silent gaps detected
- keeping a gap in review updates the plan and the export honours it
- MP3 export at 1.5x: valid file, duration exactly 5:05, natural pitch
- comparison vs Audacity manual workflow: 3 clicks / ~23 s vs 60+ actions
- 25 automated engine tests pass; accessibility audit reports 0 serious issues
