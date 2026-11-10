/**
 * Silence detection on pre-computed RMS frames + cut/keep plan building.
 * All times in seconds; all pure and node-testable.
 */

export type Range = readonly [number, number]

export interface SilenceParams {
  /** Amplitude floor in dBFS: frames below this count as silence. */
  thresholdDb: number
  /** Shortest removable cut (after padding is respected). */
  minGapSec: number
  /** Natural silence kept around each side of speech. */
  padSec: number
}

/**
 * Detect removable gaps from the RMS frame track.
 * A cut is placed strictly inside each fully-silent run (padSec trimmed from
 * both edges so speech keeps its natural padding) and kept only when its
 * length (including that padding) is at least max(minGapSec, one frame).
 * Safety: a threshold so loose that not a single frame reads as speech
 * disables all cutting instead of shredding the whole recording.
 */
export function detectGaps(
  rmsDb: ArrayLike<number>,
  frameSec: number,
  p: SilenceParams,
): Range[] {
  const n = rmsDb.length
  const padFrames = Math.floor(p.padSec / frameSec)
  const minFrames = Math.max(1, Math.round(p.minGapSec / frameSec))

  let sawSpeech = false
  for (let i = 0; i < n; i++) {
    if (rmsDb[i] >= p.thresholdDb) {
      sawSpeech = true
      break
    }
  }
  if (!sawSpeech) return []

  const gaps: Range[] = []

  let i = 0
  while (i < n) {
    if (rmsDb[i] < p.thresholdDb) {
      let j = i
      while (j < n && rmsDb[j] < p.thresholdDb) j++
      const cutStart = i + padFrames
      const cutEnd = j - padFrames
      if (cutEnd - cutStart >= minFrames) {
        gaps.push([cutStart * frameSec, cutEnd * frameSec])
      }
      i = j
    } else {
      i++
    }
  }
  return gaps
}

/** Inverse map of the gap list — the ranges that are kept in the export. */
export function buildKeepSegments(
  gaps: readonly Range[],
  totalSec: number,
): Range[] {
  const keep: [number, number][] = []
  let cursor = 0
  for (const [a, b] of gapsSorted(gaps)) {
    if (a > cursor) keep.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (cursor < totalSec - 1e-6) keep.push([cursor, totalSec])
  // merge + drop degenerate
  const out: [number, number][] = []
  for (const [a, b] of keep) {
    const prev = out[out.length - 1]
    if (prev && a - prev[1] < 1e-6) prev[1] = Math.max(prev[1], b)
    else if (b - a > 1e-6) out.push([a, b])
  }
  return out
}

function gapsSorted(gaps: readonly Range[]): Range[] {
  const sorted = [...gaps].sort((x, y) => x[0] - y[0])
  return sorted
}

/** Stats shown in the silence panel. */
export function gapStats(gaps: readonly Range[]): { count: number; removedSec: number } {
  let removedSec = 0
  for (const [a, b] of gaps) removedSec += Math.max(0, b - a)
  return { count: gaps.length, removedSec }
}

/**
 * Playback helpers for the “skip silences in preview” mode.
 * Returns end of the gap covering t, or null when t is in speech.
 */
export function gapAt(gaps: readonly Range[], t: number): Range | null {
  for (let i = 0; i < gaps.length; i++) {
    const g = gaps[i]
    if (t >= g[0] && t < g[1]) return g
    if (g[0] > t) break
  }
  return null
}

/** Next preview playback position for time t honoring “skip silence”. */
export function nextKeepTime(gaps: readonly Range[], t: number): number {
  const g = gapAt(gaps, t)
  return g ? g[1] : t
}

/** Seconds → native frames with clamping. */
export function secToFrame(sec: number, durationSec: number, rate: number): number {
  const total = Math.round(durationSec * rate)
  return Math.min(total, Math.max(0, Math.round(sec * rate)))
}

/** Stable identity for a gap across recomputes: rounded start in ms. */
export function gapKeyOf(gap: Range): number {
  return Math.round(gap[0] * 1000)
}

/** Gaps the user kept (not locked as removable). */
export function enabledGaps(gaps: readonly Range[], excluded: readonly number[]): Range[] {
  const set = new Set(excluded)
  const out: Range[] = []
  for (const g of gaps) {
    if (!set.has(gapKeyOf(g))) out.push([g[0], g[1]])
  }
  return out
}

/**
 * Sort, merge overlapping/touching ranges and drop degenerate ones.
 * Used to normalize the gap list after a hand edit.
 */
export function normalizeRanges(gaps: readonly Range[]): Range[] {
  const out: [number, number][] = []
  for (const [a, b] of gapsSorted(gaps)) {
    if (b - a <= 1e-6) continue
    const prev = out[out.length - 1]
    if (prev && a - prev[1] <= 1e-6) prev[1] = Math.max(prev[1], b)
    else out.push([a, b])
  }
  return out
}

/** Insert a manually added gap, keeping the list sorted and non-overlapping. */
export function addGapRange(gaps: readonly Range[], gap: Range): Range[] {
  return normalizeRanges([...gaps, gap])
}

/** Remove the gap whose start key matches `key` (permanent delete). */
export function removeGapByKey(gaps: readonly Range[], key: number): Range[] {
  return gaps.filter((g) => gapKeyOf(g) !== key)
}

/**
 * Sub-frame cut refinement from the frame-quantized cuts.
 *
 * The frame meter classifies whole 128 ms windows, so a cut edge lands on
 * the analysis grid — an average of ~56 ms of almost-silent speech tail
 * stays un-cut per edge because box averaging bleeds speech energy into
 * the boundary frame. This scans the analysis-domain mono around each
 * edge with an 8 ms RMS window to find the *evidence-backed* silence
 * onset (last/first window at or above the threshold line) and re-places
 * the edge `padSec` away from it, while never leaving the region between
 * the frame cut and the neighbouring evidence.
 *
 * Semantics are preserved exactly: at least padSec of proven silence
 * remains between any speech and the refined cut, so a threshold that
 * never misbehaves behaves the same as before (within ~8 ms).
 */
export function refineGaps(
  gaps: readonly Range[],
  mono: ArrayLike<number>,
  rate: number,
  thresholdDb: number,
  padSec: number,
): Range[] {
  const n = mono.length
  if (gaps.length === 0 || n === 0) return []
  const win = Math.max(4, Math.round(rate * 0.008)) // 8 ms evidence window
  const floor = Math.pow(10, thresholdDb / 20) // linear amplitude floor
  const keep = Math.round(padSec * rate)
  const scan = Math.round((padSec + 0.2) * rate) // covers frame-grid residue
  const out: Range[] = []
  let prevEnd = -1 // refined end of the previous gap, in samples

  for (const [a, b] of gaps) {
    const na = Math.max(0, Math.round(a * rate))
    const nb = Math.min(n, Math.round(b * rate))
    if (nb - na < win / 2) continue

    /* start edge: scan left for the last loud window; silence must begin
       there and the cut may reclaim frame-grid residue below it */
    let refStart = na
    if (na > 0) {
      const s0 = Math.max(0, na - scan)
      let e = -1 // end of the last loud window
      for (let wEnd = na; wEnd - win >= s0; wEnd -= win) {
        let sum = 0
        for (let k = wEnd - win; k < wEnd; k++) sum += mono[k] * mono[k]
        if (Math.sqrt(sum / win) >= floor) {
          e = wEnd
          break
        }
      }
      if (e >= 0) refStart = Math.min(na, e + keep)
      if (prevEnd >= 0 && refStart < prevEnd) refStart = prevEnd
    }

    /* end edge: scan right for the first loud window; keep padSec before it */
    let refEnd = nb
    if (nb < n) {
      const s1 = Math.min(n, nb + scan)
      let e2 = -1 // start of the first loud window
      for (let wStart = nb; wStart + win <= s1; wStart += win) {
        let sum = 0
        for (let k = wStart; k < wStart + win; k++) sum += mono[k] * mono[k]
        if (Math.sqrt(sum / win) >= floor) {
          e2 = wStart
          break
        }
      }
      if (e2 >= 0) refEnd = Math.max(nb, e2 - keep)
      if (refEnd - refStart < win / 2) continue
    }

    prevEnd = refEnd
    out.push([refStart / rate, refEnd / rate])
  }
  return out
}
