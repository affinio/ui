import { getCurrentScope, isRef, onScopeDispose, shallowRef, watch } from "vue"
import type { Ref, ShallowRef } from "vue"
import type { DiagramEngineController } from "./useDiagramEngine.js"
import type { DiagramViewport } from "@affino/diagram-core"

export type DiagramViewportController = Readonly<{
  viewport: ShallowRef<DiagramViewport>
  setViewport: (viewport: Partial<DiagramViewport>) => void
  attachViewportElement: (element: Element | null) => void
  dispose: () => void
}>

type ResizeObserverLike = {
  observe: (element: Element) => void
  disconnect: () => void
}

type ResizeObserverCtor = new (callback: (entries: ReadonlyArray<{ contentRect: { width: number; height: number } }>) => void) => ResizeObserverLike

export type DiagramViewportOptions = Readonly<{
  element?: Ref<Element | null> | Element | null
  resizeObserver?: ResizeObserverCtor
}>

export function useDiagramViewport(controller: DiagramEngineController, options: DiagramViewportOptions = {}): DiagramViewportController {
  const viewport = shallowRef(controller.scene.value.viewport)
  let observer: ResizeObserverLike | null = null
  let attachedElement: Element | null = null
  let disposed = false
  let stopElementWatch: (() => void) | null = null
  const subscription = controller.engine.subscribe((scene) => {
    viewport.value = scene.viewport
  })

  const setViewport = (next: Partial<DiagramViewport>) => {
    controller.dispatch({ type: "setViewport", viewport: next })
  }

  const attachViewportElement = (element: Element | null) => {
    if (observer) {
      observer.disconnect()
      observer = null
    }
    attachedElement = element
    if (!element || disposed) {
      return
    }
    const ResizeObserverImpl = (options.resizeObserver ?? globalThis.ResizeObserver) as ResizeObserverCtor | undefined
    if (!ResizeObserverImpl) {
      return
    }
    observer = new ResizeObserverImpl((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) {
        setViewport({ width: rect.width, height: rect.height })
      }
    })
    observer.observe(element)
  }

  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    subscription.unsubscribe()
    observer?.disconnect()
    observer = null
    stopElementWatch?.()
    stopElementWatch = null
    attachedElement = null
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }

  if (isRef(options.element)) {
    stopElementWatch = watch(options.element, attachViewportElement, { immediate: true })
  } else {
    const initialElement = unwrapElement(options.element)
    if (initialElement) {
      attachViewportElement(initialElement)
    }
  }

  return { viewport, setViewport, attachViewportElement, dispose }
}

function unwrapElement(value: DiagramViewportOptions["element"]): Element | null {
  if (!value) {
    return null
  }
  if ("value" in value) {
    return value.value
  }
  return value
}
