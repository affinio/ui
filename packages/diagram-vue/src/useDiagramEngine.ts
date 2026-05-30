import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import { createDiagramEngine, type DiagramChange, type DiagramCommand, type DiagramCommandResult, type DiagramEngine, type DiagramScene, type DiagramSceneInput } from "@affino/diagram-core"

export type DiagramEngineController = Readonly<{
  engine: DiagramEngine
  scene: ShallowRef<DiagramScene>
  change: ShallowRef<DiagramChange>
  dispatch: (command: DiagramCommand) => DiagramCommandResult
  dispose: () => void
}>

export type DiagramEngineOptions = Readonly<{
  engine?: DiagramEngine
  initialScene?: DiagramSceneInput
}>

export function useDiagramEngine(options: DiagramEngineOptions | DiagramSceneInput = {}): DiagramEngineController {
  const normalized = isEngineOptions(options) ? options : { initialScene: options }
  const engine = normalized.engine ?? createDiagramEngine(normalized.initialScene ?? {})
  const scene = shallowRef(engine.getScene())
  const change = shallowRef(engine.getLastChange())
  const subscription = engine.subscribe((nextScene, nextChange) => {
    scene.value = nextScene
    change.value = nextChange
  })
  let disposed = false
  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    subscription.unsubscribe()
  }
  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }
  return {
    engine,
    scene,
    change,
    dispatch: (command) => engine.dispatch(command),
    dispose,
  }
}

function isEngineOptions(value: DiagramEngineOptions | DiagramSceneInput): value is DiagramEngineOptions {
  return "engine" in value || "initialScene" in value
}
