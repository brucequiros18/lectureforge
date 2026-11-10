import { useSyncExternalStore } from 'react'
import { engine } from '../engine/store.ts'
import type { EngineState } from '../engine/store.ts'

export function useEngine(): EngineState {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
}

export { engine }
