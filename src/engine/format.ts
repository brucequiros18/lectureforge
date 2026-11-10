/**
 * Best-effort duration formatting. Kept tiny + pure for tests.
 */

export function fmtClock(sec: number, withHours = true): string {
  if (!Number.isFinite(sec)) return withHours ? '00:00:00' : '00:00'
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const two = (n: number) => String(n).padStart(2, '0')
  return withHours ? `${two(h)}:${two(m)}:${two(ss)}` : `${two(m)}:${two(ss)}`
}

export function fmtBytes(b: number): string {
  if (!Number.isFinite(b)) return '—'
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${b} B`
}

export function fmtSaved(sec: number): string {
  const s = Math.round(Math.abs(sec))
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${s}s`
}

/** Strip filesystem-hostile characters and stray extensions. */
export function sanitizeName(base: string): string {
  const stripped = base.replace(/\.[^.]*$/, '')
  return stripped.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'lecture'
}

/** `lecture_cut_speed1p5x.mp3` — suffixes reflect what actually changed. */
export function buildExportName(
  rawBase: string,
  gapCount: number,
  speed: number,
  format: string,
): string {
  const base = sanitizeName(rawBase)
  const cut = gapCount > 0 ? '_cut' : ''
  const sped = Math.abs(speed - 1) > 1e-4 ? `_speed${String(speed).replace('.', 'p')}x` : ''
  return `${base}${cut}${sped}.${format}`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
