declare module 'soundtouchjs' {
  export class Stretch {
    tempo: number
    quickSeek: boolean
    inputBuffer: unknown
    outputBuffer: unknown
    process(): void
  }

  export class SoundTouch {
    tempo: number
    rate: number
    pitch: number
    stretch: Stretch
    inputBuffer: unknown
    outputBuffer: unknown
    process(): void
    clear(): void
    calculateEffectiveRateAndTempo(): void
  }

  export class WebAudioBufferSource {
    constructor(
      buffer: { numberOfChannels: number; getChannelData(channel: number): Float32Array },
    )
  }

  export class SimpleFilter {
    constructor(sourceSound: unknown, pipe: SoundTouch, callback?: () => void)
    extract(target: Float32Array, numFrames?: number): number
    position: number
    sourcePosition: number
    clear(): void
  }
}
