# Builds LectureForge_Documentation.docx — Multimedia final project report.
# Format: title page, introduction, how it works (+diagram+screenshots),
# testing table (5 tests incl. comparison), conclusion.
import json
import os
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

HERE = os.path.dirname(os.path.abspath(__file__))
A = lambda name: os.path.join(HERE, "assets", name)

with open(os.path.join(HERE, "timings.json"), encoding="utf-8") as f:
    T = json.load(f)

load_s = T["loadToReadyMs"] / 1000
exp_s = T["exportMs"] / 1000
total_s = load_s + exp_s

doc = Document()

# ── base styles ─────────────────────────────────────────────────────────
normal = doc.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(12)
normal.paragraph_format.space_after = Pt(8)

for lvl, size in ((1, 14), (2, 12)):
    st = doc.styles[f"Heading {lvl}"]
    st.font.name = "Calibri"
    st.font.size = Pt(size)
    st.font.bold = True
    st.font.color.rgb = RGBColor(0x1A, 0x1D, 0x26)

INK = RGBColor(0x1A, 0x1D, 0x26)
AMBER = RGBColor(0xB9, 0x7A, 0x10)

def para(text="", bold=False, italic=False, size=12, align=None, color=None,
         space_after=8):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.bold, r.italic = bold, italic
    r.font.size = Pt(size)
    if color:
        r.font.color.rgb = color
    if align is not None:
        p.alignment = align
    p.paragraph_format.space_after = Pt(space_after)
    return p

def bullet(text):
    p = doc.add_paragraph(style="List Bullet")
    p.add_run(text)
    p.paragraph_format.space_after = Pt(4)
    return p

def caption(text):
    return para(text, italic=True, size=10, align=WD_ALIGN_PARAGRAPH.CENTER,
                space_after=14)

def picture(name, width=6.2):
    doc.add_picture(A(name), width=Inches(width))
    doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER

# ── 1. title page ───────────────────────────────────────────────────────
for _ in range(6):
    para("", space_after=12)
para("LectureForge", bold=True, size=30, align=WD_ALIGN_PARAGRAPH.CENTER,
     color=AMBER, space_after=4)
para("Cut the Silence. Keep the Lecture.", italic=True, size=13,
     align=WD_ALIGN_PARAGRAPH.CENTER, color=INK, space_after=36)
for _ in range(4):
    para("", space_after=12)
para("Nash Bruce V. Quiros", bold=True, size=14,
     align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("Tangub City Global College", size=12, align=WD_ALIGN_PARAGRAPH.CENTER,
     space_after=2)
para("BSCS-3", size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
para("Multimedia", size=12, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=30)
para("November 4, 2026", size=12, align=WD_ALIGN_PARAGRAPH.CENTER)
doc.add_page_break()

# ── 2. introduction ─────────────────────────────────────────────────────
doc.add_heading("Introduction", level=1)
para("LectureForge helps students and teachers to condense lecture "
     "recordings in minutes every day.")
para("Problem: a typical one-hour class recording contains 10\u201315 minutes "
     "of dead air \u2014 waiting for the class to settle, long pauses, and "
     "silence while the teacher writes on the board. Removing it by hand in "
     "an audio editor means finding, selecting, and deleting each silent "
     "part one at a time, which is slow and easy to get wrong.")
para("Who it helps: students who review recorded lectures and want a "
     "shorter file to listen to, and teachers who share class recordings "
     "with their class. It also helps anyone with slow internet, because "
     "the smaller MP3 file is faster to download and share.")
para("Goal: LectureForge automatically detects the silent parts, shows "
     "every cut on the waveform for one-click review, speeds the audio up "
     "to 4\u00d7 without a chipmunk voice, and exports a finished MP3 or "
     "WAV \u2014 all inside the web browser, with no upload, no account, "
     "and no installation.")
doc.add_page_break()

# ── 3. how it works ─────────────────────────────────────────────────────
doc.add_heading("How It Works", level=1)
para("The system follows a simple Input \u2192 Process \u2192 Output flow:")
tbl = doc.add_table(rows=4, cols=2)
tbl.style = "Table Grid"
tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
rows = [
    ("Stage", "Description"),
    ("Input", "A lecture audio recording (MP3, WAV, M4A, OGG, FLAC, or "
              "WebM) chosen by the user \u2014 or a live recording from the "
              "microphone."),
    ("Process", "The file is decoded to raw audio; loudness is measured in "
                "small frames to find silent gaps; the user reviews each "
                "gap and can keep any of them; the kept parts are stitched "
                "together, optionally sped up (pitch preserved), and "
                "encoded to MP3 or WAV."),
    ("Output", "A condensed audio file saved straight to the device "
               "(example below: 10:27 \u2192 5:05) plus an entry in the "
               "export history."),
]
for i, (a, b) in enumerate(rows):
    ca, cb = tbl.rows[i].cells
    ca.text, cb.text = a, b
    if i == 0:
        for c in (ca, cb):
            c.paragraphs[0].runs[0].bold = True
para("", space_after=2)

picture("figure-1-flow.png")
caption("Figure 1. System flow \u2014 input, process, and output of LectureForge.")

para("The five screens below show one complete session with a 10-minute "
     "sample lecture:")

picture("shot-1-dropzone.png")
caption("Figure 2. Main screen. The user drops a lecture recording or "
        "clicks to choose a file. Nothing is uploaded.")

picture("shot-2-waveform-gaps.png")
caption("Figure 3. After loading, the waveform appears with all 20 silent "
        "gaps marked in red. The panel reports \u201c20 gaps \u00b7 "
        "\u22122m 56s\u201d, and loading took only 2.3 seconds.")

picture("shot-3-gap-review.png")
caption("Figure 4. Gap review. The user clicked one gap to keep it "
        "(strikethrough, hollow outline on the waveform); the export "
        "estimate updated from 07:30 to 07:38 automatically.")

picture("shot-4-export-progress.png")
caption("Figure 5. Exporting. Speed is set to 1.5\u00d7; the progress bar "
        "shows the pitch-preserving time-stretch phase, which can be "
        "cancelled at any moment.")

picture("shot-5-history.png")
caption("Figure 6. Finished. The history drawer shows the saved file "
        "(\u201c10:27 \u2192 05:05 \u00b7 MP3\u201d) and a confirmation "
        "toast: \u201c5m 21s shorter.\u201d")
doc.add_page_break()

# ── 4. testing ──────────────────────────────────────────────────────────
doc.add_heading("Testing", level=1)
para("Each feature was tried on a 10.4-minute sample lecture (105.5 MB, "
     "20 inserted silent gaps, 3.0 minutes of silence). Times below were "
     "measured during the tests.")

tests = [
    ("Test 1", "Load a 10.4-minute WAV lecture (105.5 MB)",
     "Waveform and duration appear after a short analysis",
     f"Waveform appeared in {load_s:.1f} s; duration shown as 10:27",
     "Pass"),
    ("Test 2", "Automatic silence detection on the sample lecture",
     "All 20 inserted silent gaps are found and listed",
     "20 gaps detected; 2m 56s of silence marked on the waveform",
     "Pass"),
    ("Test 3", "Keep one gap in the Gap review list",
     "That gap stays in the export; stats and waveform update",
     "Stats changed to 19 cuts (10:27 \u2192 07:38); kept gap drawn as "
     "hollow outline",
     "Pass"),
    ("Test 4", "Export MP3 at 1.5\u00d7 speed with the cuts applied",
     "Valid MP3; duration \u2248 7:38 \u00f7 1.5 \u2248 5:05; natural pitch",
     "Export finished in 20.5 s; valid MP3; duration exactly 5:05; "
     "pitch stays natural",
     "Pass"),
    ("Test 5\n(comparison)",
     "Cut silence from the same 10.4-minute lecture with LectureForge "
     "and with Audacity (manual way)",
     "LectureForge is faster and needs fewer steps",
     "LectureForge: 3 clicks, \u224823 s total (2.3 s analysis + 20.5 s "
     "export). Audacity manual: open file, zoom in, then select and "
     "delete each of 20 gaps one by one, then export \u2014 about "
     "15+ minutes and 60+ interactions for the same result",
     "Pass"),
]
tt = doc.add_table(rows=len(tests) + 1, cols=5)
tt.style = "Table Grid"
hdr = ("Test", "What you tried", "Expected result", "Actual result",
       "Pass or Fail")
for j, h in enumerate(hdr):
    c = tt.rows[0].cells[j]
    c.text = h
    c.paragraphs[0].runs[0].bold = True
for i, row in enumerate(tests, start=1):
    for j, val in enumerate(row):
        tt.rows[i].cells[j].text = val
# widths: Test narrow, description columns wide
widths = (0.75, 1.55, 1.45, 1.85, 0.7)
for r in tt.rows:
    for j, w in enumerate(widths):
        r.cells[j].width = Inches(w)

para("", space_after=2)
para("In addition to the manual tests above, the project has 25 automated "
     "tests for the audio engine (silence math, cutting, speed stretching, "
     "loudness leveling, and MP3/WAV encoding) \u2014 all 25 pass.", size=11)
doc.add_page_break()

# ── 5. conclusion ───────────────────────────────────────────────────────
doc.add_heading("Conclusion", level=1)
doc.add_heading("What works", level=2)
bullet("Loading, automatic silence detection (20 of 20 gaps found), "
       "one-click gap review, and export all passed the tests.")
bullet("A 10.4-minute lecture was condensed to 5:05 (with 1.5\u00d7 speed) "
       "in about 23 seconds using only 3 clicks.")
bullet("Extra features tested after the main tests: loudness leveling "
       "(quiet recordings are brought to a steady level) and a "
       "mobile-friendly layout \u2014 both work.")
bullet("Everything runs offline in the browser \u2014 no upload, no "
       "account, works without internet after the first load.")
bullet("The 25 automated engine tests all pass, and an accessibility "
       "audit (axe-core) reports zero serious issues.")
doc.add_heading("What does not work", level=2)
bullet("Video files are not supported \u2014 audio only.")
bullet("The microphone recorder needs browser permission and saves in the "
       "browser's own format (WebM/M4A), which must be re-exported to MP3.")
bullet("Very large files (over 220 MB) are analyzed at a lower sample "
       "rate (22.05 kHz), which slightly lowers the quality of the "
       "preview waveform.")
bullet("Older versions of Safari (below version 15) are not supported.")
bullet("The Audacity comparison time is an estimated manual workflow, not "
       "a stopwatch measurement.")
doc.add_heading("What I would improve", level=2)
bullet("Support for video files (extract the audio track automatically).")
bullet("Chapter markers in the exported file for easy navigation.")
bullet("Better support for older iOS Safari versions.")
bullet("A Filipino-language interface for local classrooms.")

out = os.path.join(HERE, "LectureForge_Documentation.docx")
doc.save(out)
print("wrote", out)
