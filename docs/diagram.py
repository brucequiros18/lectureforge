# Draws Figure 1 — the Input -> Process -> Output system flow diagram.
# Rendered with matplotlib for clean text/arrows; saved as PNG for the docx.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import os

INK = "#1a1d26"
PANEL = "#f5f2ec"
ACCENT = "#b97a10"   # darker amber for print contrast
EDGE = "#8a8f9c"
SUB = "#4a4f5c"

fig, ax = plt.subplots(figsize=(10.2, 4.4), dpi=200)
ax.set_xlim(0, 10.2)
ax.set_ylim(0, 4.4)
ax.axis("off")
fig.patch.set_facecolor("white")

def box(x, y, w, h, title, lines, edge, face):
    p = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.06,rounding_size=0.12",
                       linewidth=1.6, edgecolor=edge, facecolor=face)
    ax.add_patch(p)
    ax.text(x + w / 2, y + h - 0.34, title, ha="center", va="center",
            fontsize=12.5, fontweight="bold", color=INK)
    body = "\n".join(lines)
    ax.text(x + w / 2, y + (h - 0.5) / 2, body, ha="center", va="center",
            fontsize=9.6, color=SUB, linespacing=1.55)

def arrow(x0, y0, x1, y1, label):
    a = FancyArrowPatch((x0, y0), (x1, y1), arrowstyle="-|>", mutation_scale=22,
                        linewidth=1.8, color=EDGE)
    ax.add_patch(a)
    ax.text((x0 + x1) / 2, y0 + 0.16, label, ha="center", va="bottom",
            fontsize=8.8, color=SUB, style="italic")

# three stages
box(0.25, 1.1, 2.7, 2.5, "INPUT",
    ["Lecture audio file", "(MP3, WAV, M4A, OGG…)",
     "up to hours long", "", "or microphone recording"],
    ACCENT, "#fdf6e9")
box(3.85, 1.1, 2.9, 2.5, "PROCESS",
    ["1. Decode to raw audio", "2. Detect silence gaps", "3. User reviews gaps",
     "4. Cut + speed change", "5. Encode MP3 / WAV"],
    EDGE, "#f2f4f8")
box(7.65, 1.1, 2.3, 2.5, "OUTPUT",
    ["Condensed file", "", "e.g. 10:27 → 5:05", "MP3 or WAV", "saved to device"],
    ACCENT, "#fdf6e9")

arrow(3.0, 2.35, 3.8, 2.35, "")
arrow(6.8, 2.35, 7.6, 2.35, "")

ax.text(5.1, 4.05, "", ha="center")
ax.text(5.1, 0.45, "All steps run locally in the browser (Web Workers) — the audio never leaves the device.",
        ha="center", va="center", fontsize=9.2, color=SUB, style="italic")

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "figure-1-flow.png")
fig.savefig(out, bbox_inches="tight", facecolor="white")
print("wrote", out)
