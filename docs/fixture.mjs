// Generates a deterministic ~10-minute "lecture" WAV for documentation
// screenshots + timing measurements. Speech = syllable-modulated noise
// bursts; gaps = true digital silence. Usage: node docs/fixture.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const minutes = Number(process.argv[2] ?? 10)
const outName = process.argv[3] ?? (minutes === 10 ? 'Lecture-Recording-01.wav' : `Lecture-${minutes}min.wav`)
const outPath = join(here, 'assets', outName)
mkdirSync(join(here, 'assets'), { recursive: true })

const RATE = 44100
const TARGET_SEC = Math.round(minutes * 60)

// deterministic PRNG so the fixture is reproducible
let seed = 20261104
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}

// build the part list (speech burst + silence gap) until ~10 min
const parts = []
let total = 0
while (total < TARGET_SEC) {
  const speech = Math.round(16 + rnd() * 12) // 16-28 s
  const gap = Math.round(6 + rnd() * 8) // 6-14 s
  parts.push({ speech, gap })
  total += speech + gap
}

const frames = total * RATE
const l = new Float32Array(frames)
const r = new Float32Array(frames)

const fade = Math.round(0.03 * RATE) // 30 ms cosine edge fade
let pos = 0
for (const p of parts) {
  const n = p.speech * RATE
  for (let i = 0; i < n; i++) {
    const t = i / RATE
    // syllable envelope: ~3.5 Hz base + slower phrase modulation + jitter
    const syl = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * 3.5 * t + Math.sin(t * 0.9) * 2), 1.4)
    const phrase = 0.75 + 0.25 * Math.sin(2 * Math.PI * 0.31 * t)
    const env = 0.24 * syl * phrase
    // pseudo speech: lowpassed-ish noise (two octaves of hash noise)
    const nz =
      (((i * 7919) % 65535) / 65535 - 0.5) * 0.7 +
      (((i * 104729) % 65535) / 65535 - 0.5) * 0.3
    let g = env * nz
    if (i < fade) g *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fade)
    if (i > n - fade) g *= 0.5 - 0.5 * Math.cos((Math.PI * (n - i)) / fade)
    l[pos + i] = g
    r[pos + i] = g * 0.92 + (((i * 15485863) % 65535) / 65535 - 0.5) * 0.004 // tiny decorrelation
  }
  pos += n + p.gap * RATE // gap stays digital zero
}

// 16-bit PCM stereo WAV
const dataLen = frames * 4
const buf = Buffer.alloc(44 + dataLen)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + dataLen, 4)
buf.write('WAVE', 8)
buf.write('fmt ', 12)
buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20) // PCM
buf.writeUInt16LE(2, 22) // stereo
buf.writeUInt32LE(RATE, 24)
buf.writeUInt32LE(RATE * 4, 28) // byte rate
buf.writeUInt16LE(4, 32) // block align
buf.writeUInt16LE(16, 34) // bits
buf.write('data', 36)
buf.writeUInt32LE(dataLen, 40)
let o = 44
for (let i = 0; i < frames; i++) {
  let v = Math.max(-1, Math.min(1, l[i]))
  buf.writeInt16LE((v * 32767) | 0, o); o += 2
  v = Math.max(-1, Math.min(1, r[i]))
  buf.writeInt16LE((v * 32767) | 0, o); o += 2
}

writeFileSync(outPath, buf)
const sil = parts.reduce((s, p) => s + p.gap, 0)
console.log(`wrote ${outPath}`)
console.log(`duration ${total}s (${(total / 60).toFixed(1)} min), parts ${parts.length}, inserted silence ${sil}s (${(sil / 60).toFixed(1)} min), size ${(buf.length / 1048576).toFixed(1)} MB`)
