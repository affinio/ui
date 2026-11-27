import { computed, defineComponent, h, ref } from "vue"
import type { PropType, VNodeChild } from "vue"
import type { DiagramId, DiagramViewport } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"

/** Renders persistent Core guides in document coordinates and commits one Core update after a completed drag. */
export const DiagramGuidesOverlay = defineComponent({
  name: "DiagramGuidesOverlay",
  props: { controller: { type: Object as PropType<DiagramEngineController>, required: true }, viewport: { type: Object as PropType<DiagramViewport>, default: undefined } },
  setup(props) {
    const drag = ref<{ id: DiagramId; pointerId: number; axis: "x" | "y"; position: number } | null>(null)
    const viewport = computed(() => props.viewport ?? props.controller.scene.value.viewport)
    const worldPoint = (event: PointerEvent) => {
      const svg = (event.currentTarget as SVGGElement).ownerSVGElement
      const matrix = svg?.getScreenCTM()
      if (!svg || !matrix) return null
      const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY
      const world = point.matrixTransform(matrix.inverse())
      return { x: world.x, y: world.y }
    }
    const onPointermove = (event: PointerEvent) => {
      if (!drag.value || drag.value.pointerId !== event.pointerId) return
      const point = worldPoint(event)
      if (point) drag.value = { ...drag.value, position: drag.value.axis === "x" ? point.x : point.y }
    }
    const onPointerup = (event: PointerEvent) => {
      if (!drag.value || drag.value.pointerId !== event.pointerId) return
      const current = drag.value
      const point = worldPoint(event)
      drag.value = null
      if (point) props.controller.dispatch({ type: "updateGuide", id: current.id, guide: { position: current.axis === "x" ? point.x : point.y } })
    }
    const onPointercancel = (event: PointerEvent) => { if (drag.value?.pointerId === event.pointerId) drag.value = null }
    const beginDrag = (event: PointerEvent, id: DiagramId, axis: "x" | "y", locked: boolean) => {
      if (locked || event.button !== 0) return
      const point = worldPoint(event)
      if (!point) return
      event.preventDefault(); event.stopPropagation()
      ;(event.currentTarget as SVGLineElement).setPointerCapture?.(event.pointerId)
      drag.value = { id, pointerId: event.pointerId, axis, position: axis === "x" ? point.x : point.y }
    }
    return () => {
      const view = viewport.value
      const children: VNodeChild[] = []
      for (const guide of props.controller.scene.value.guides.values()) {
        if (guide.visible === false) continue
        const position = drag.value?.id === guide.id ? drag.value.position : guide.position
        const common = { "stroke-dasharray": "5 4", "vector-effect": "non-scaling-stroke", "data-guide-axis": guide.axis, "data-guide-locked": guide.locked || undefined }
        const coordinates = guide.axis === "x"
          ? { x1: position, x2: position, y1: view.y, y2: view.y + view.height }
          : { x1: view.x, x2: view.x + view.width, y1: position, y2: position }
        children.push(h("line", { ...coordinates, ...common, stroke: "transparent", "stroke-width": 12, "pointer-events": "stroke", "data-guide-id": guide.id, cursor: guide.locked ? "default" : "move", onPointerdown: (event: PointerEvent) => beginDrag(event, guide.id, guide.axis, guide.locked === true) }))
        children.push(h("line", { ...coordinates, ...common, stroke: "var(--affino-diagram-guide, #d13c2f)", "stroke-width": 1, "pointer-events": "none", "aria-hidden": "true" }))
      }
      if (drag.value) children.push(drag.value.axis === "x"
        ? h("line", { x1: drag.value.position, x2: drag.value.position, y1: view.y, y2: view.y + view.height, stroke: "var(--affino-diagram-guide-preview, #a92a20)", "stroke-width": 2, "pointer-events": "none" })
        : h("line", { x1: view.x, x2: view.x + view.width, y1: drag.value.position, y2: drag.value.position, stroke: "var(--affino-diagram-guide-preview, #a92a20)", "stroke-width": 2, "pointer-events": "none" }))
      return h("g", { class: "affino-diagram-guides", "aria-label": "Diagram guides", onPointermove, onPointerup, onPointercancel }, children)
    }
  },
})
