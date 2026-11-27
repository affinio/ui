import { onScopeDispose } from "vue"
import type { Ref } from "vue"
import type { DiagramViewportController } from "@affino/diagram-vue"

type TouchPoint = Readonly<{ x: number; y: number }>

/** Shared wheel, trackpad-pinch, and two-finger touch navigation for diagram demos. */
export function useDiagramCanvasGestures(
  element: Ref<HTMLElement | SVGSVGElement | null>,
  viewport: DiagramViewportController,
  cancelInteraction: () => void,
) {
  const pointers = new Map<number, TouchPoint>()
  let pinch: { distance: number; zoom: number; anchor: TouchPoint; midpoint: TouchPoint } | null = null
  let pinchActive = false
  let frame: number | null = null
  let pendingUpdate: (() => void) | null = null
  let wheelDelta = { x: 0, y: 0, zoom: 0, anchor: null as TouchPoint | null }

  const schedule = (update: () => void) => {
    pendingUpdate = update
    if (frame !== null) return
    frame = requestAnimationFrame(() => {
      frame = null
      const next = pendingUpdate
      pendingUpdate = null
      next?.()
    })
  }

  const pointerDown = (event: PointerEvent): boolean => {
    if (event.pointerType !== "touch") return pinchActive
    event.preventDefault()
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size >= 2) {
      const pair = [...pointers.values()].slice(0, 2)
      const midpoint = midpointOf(pair[0]!, pair[1]!)
      const rect = element.value?.getBoundingClientRect()
      if (!rect) return false
      const current = viewport.viewport.value
      pinch = {
        distance: distance(pair[0]!, pair[1]!),
        zoom: current.zoom,
        midpoint,
        anchor: { x: current.x + (midpoint.x - rect.left) / current.zoom, y: current.y + (midpoint.y - rect.top) / current.zoom },
      }
      pinchActive = true
      cancelInteraction()
      try { element.value?.setPointerCapture?.(event.pointerId) } catch { /* pointer capture is optional */ }
    }
    return pinchActive
  }

  const pointerMove = (event: PointerEvent): boolean => {
    if (event.pointerType === "touch" && pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!pinchActive || pointers.size < 2 || !pinch) return false
    event.preventDefault()
    const pair = [...pointers.values()].slice(0, 2)
    const midpoint = midpointOf(pair[0]!, pair[1]!)
    const start = pinch
    const ratio = distance(pair[0]!, pair[1]!) / Math.max(1, start.distance)
    const zoom = clamp(start.zoom * ratio, 0.05, 4)
    schedule(() => {
      const rect = element.value?.getBoundingClientRect()
      if (!rect) return
      viewport.setViewport({
        x: start.anchor.x - (midpoint.x - rect.left) / zoom,
        y: start.anchor.y - (midpoint.y - rect.top) / zoom,
        width: rect.width / zoom,
        height: rect.height / zoom,
        zoom,
      })
    })
    return true
  }

  const finishPointer = (event: PointerEvent): boolean => {
    if (!pointers.has(event.pointerId)) return pinchActive
    const handled = pinchActive
    pointers.delete(event.pointerId)
    if (pointers.size < 2) {
      pinchActive = false
      pinch = null
    }
    return handled
  }

  const wheel = (event: WheelEvent): void => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      wheelDelta.zoom += event.deltaY
      wheelDelta.anchor = { x: event.clientX, y: event.clientY }
    } else {
      wheelDelta.x += event.deltaX || (event.shiftKey ? event.deltaY : 0)
      wheelDelta.y += event.shiftKey ? 0 : event.deltaY
    }
    schedule(() => {
      const rect = element.value?.getBoundingClientRect()
      if (!rect) { wheelDelta = { x: 0, y: 0, zoom: 0, anchor: null }; return }
      const current = viewport.viewport.value
      if (wheelDelta.zoom) {
        const anchor = wheelDelta.anchor ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        const zoom = clamp(current.zoom * Math.exp(-wheelDelta.zoom * 0.002), 0.05, 4)
        const worldX = current.x + (anchor.x - rect.left) / current.zoom
        const worldY = current.y + (anchor.y - rect.top) / current.zoom
        viewport.setViewport({ x: worldX - (anchor.x - rect.left) / zoom, y: worldY - (anchor.y - rect.top) / zoom, width: rect.width / zoom, height: rect.height / zoom, zoom })
      } else if (wheelDelta.x || wheelDelta.y) {
        viewport.setViewport({ x: current.x + wheelDelta.x / current.zoom, y: current.y + wheelDelta.y / current.zoom })
      }
      wheelDelta = { x: 0, y: 0, zoom: 0, anchor: null }
    })
  }

  onScopeDispose(() => {
    if (frame !== null) cancelAnimationFrame(frame)
    pointers.clear()
  })
  return { pointerDown, pointerMove, pointerUp: finishPointer, pointerCancel: finishPointer, wheel }
}

function midpointOf(a: TouchPoint, b: TouchPoint): TouchPoint { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
function distance(a: TouchPoint, b: TouchPoint): number { return Math.hypot(a.x - b.x, a.y - b.y) }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
