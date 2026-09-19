import { getCurrentScope, onScopeDispose, shallowRef, watch } from "vue"
import type { ShallowRef } from "vue"
import { createEntityGeometry, type DiagramId, type DiagramRect, type DiagramViewport } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"

export type DiagramTextEditorOverlay = Readonly<{
  id: DiagramId
  text: string
  bounds: DiagramRect
  style: Readonly<Record<string, string>>
}>

export type DiagramTextEditorController = Readonly<{
  activeEditor: ShallowRef<DiagramTextEditorOverlay | null>
  beginTextEdit: (id: DiagramId) => boolean
  updateText: (text: string) => void
  commitTextEdit: (text?: string) => boolean
  cancelTextEdit: () => void
  dispose: () => void
}>

export type DiagramTextEditorOptions = Readonly<{
  viewport?: Readonly<{ value: DiagramViewport }>
}>

export function useDiagramTextEditor(controller: DiagramEngineController, options: DiagramTextEditorOptions = {}): DiagramTextEditorController {
  const activeEditor = shallowRef<DiagramTextEditorOverlay | null>(null)
  let disposed = false

  const buildOverlay = (id: DiagramId, textOverride?: string): DiagramTextEditorOverlay | null => {
    const scene = controller.scene.value
    const entity = scene.entities.textsById.get(id)
    if (!entity) {
      return null
    }
    const geometry = createEntityGeometry(id, scene.entities)
    if (!geometry) {
      return null
    }
    return Object.freeze({
      id,
      text: textOverride ?? entity.text,
      bounds: geometry.bounds,
      style: Object.freeze(editorStyle(geometry.bounds, options.viewport?.value ?? scene.viewport)),
    })
  }

  const refreshActive = () => {
    const current = activeEditor.value
    if (!current) {
      return
    }
    activeEditor.value = buildOverlay(current.id, current.text)
  }

  const subscription = controller.engine.subscribe(() => refreshActive())
  const stopViewportWatch = options.viewport ? watch(() => options.viewport?.value, refreshActive) : null

  const beginTextEdit = (id: DiagramId): boolean => {
    const overlay = buildOverlay(id)
    if (!overlay) {
      return false
    }
    activeEditor.value = overlay
    return true
  }

  const updateText = (text: string) => {
    const current = activeEditor.value
    if (!current) {
      return
    }
    activeEditor.value = buildOverlay(current.id, text)
  }

  const commitTextEdit = (text?: string): boolean => {
    const current = activeEditor.value
    if (!current) {
      return false
    }
    const nextText = text ?? current.text
    const result = controller.dispatch({ type: "editText", id: current.id, text: nextText })
    activeEditor.value = null
    return result.changed
  }

  const cancelTextEdit = () => {
    activeEditor.value = null
  }

  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    activeEditor.value = null
    subscription.unsubscribe()
    stopViewportWatch?.()
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }

  return { activeEditor, beginTextEdit, updateText, commitTextEdit, cancelTextEdit, dispose }
}

function editorStyle(bounds: DiagramRect, viewport: DiagramViewport): Readonly<Record<string, string>> {
  const zoom = viewport.zoom || 1
  return {
    position: "absolute",
    left: `${(bounds.x - viewport.x) * zoom}px`,
    top: `${(bounds.y - viewport.y) * zoom}px`,
    width: `${bounds.width * zoom}px`,
    height: `${bounds.height * zoom}px`,
  }
}
