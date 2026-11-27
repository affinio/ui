import { computed, defineComponent, h, ref } from "vue"
import type { PropType, VNodeChild } from "vue"
import { resolveDiagramRulerTicks } from "@affino/diagram-core"
import type { DiagramRulerUnit, DiagramViewport } from "@affino/diagram-core"

/** Screen-space SVG ruler. Drag from the ruler into the canvas to emit a world-space persistent guide position. */
export const DiagramRuler = defineComponent({
  name: "DiagramRuler",
  props: {
    axis: { type: String as PropType<"x" | "y">, required: true },
    viewport: { type: Object as PropType<DiagramViewport>, required: true },
    unit: { type: String as PropType<DiagramRulerUnit>, default: "px" },
    origin: { type: Number, default: 0 },
    worldUnitsPerUnit: { type: Number, default: undefined },
    thickness: { type: Number, default: 28 },
    targetTickPx: { type: Number, default: 64 },
    label: { type: String, default: undefined },
  },
  emits: {
    "create-guide": (_axis: "x" | "y", _position: number) => true,
    "guide-preview": (_axis: "x" | "y", _position: number | null) => true,
  },
  setup(props, { emit, attrs }) {
    const dragPosition = ref<number | null>(null)
    const spanPx = computed(() => Math.max(0, (props.axis === "x" ? props.viewport.width : props.viewport.height) * props.viewport.zoom))
    const start = computed(() => props.axis === "x" ? props.viewport.x : props.viewport.y)
    const end = computed(() => start.value + spanPx.value / Math.max(props.viewport.zoom, 1e-12))
    const ticks = computed(() => resolveDiagramRulerTicks({ start: start.value, end: end.value, zoom: props.viewport.zoom, origin: props.origin, unit: props.unit, worldUnitsPerUnit: props.worldUnitsPerUnit, targetTickPx: props.targetTickPx }))
    const coordinate = (event: PointerEvent) => {
      const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
      const pixel = props.axis === "x" ? event.clientX - rect.left : event.clientY - rect.top
      return start.value + pixel / Math.max(props.viewport.zoom, 1e-12)
    }
    const onPointerdown = (event: PointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      ;(event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId)
      dragPosition.value = coordinate(event)
      emit("guide-preview", props.axis, dragPosition.value)
    }
    const onPointermove = (event: PointerEvent) => {
      if (dragPosition.value === null) return
      dragPosition.value = coordinate(event)
      emit("guide-preview", props.axis, dragPosition.value)
    }
    const onPointerup = (event: PointerEvent) => {
      if (dragPosition.value === null) return
      const position = coordinate(event)
      dragPosition.value = null
      emit("create-guide", props.axis, position)
      emit("guide-preview", props.axis, null)
    }
    const onPointercancel = () => { dragPosition.value = null; emit("guide-preview", props.axis, null) }
    return () => {
      const horizontal = props.axis === "x"
      const width = horizontal ? spanPx.value : props.thickness
      const height = horizontal ? props.thickness : spanPx.value
      const children: VNodeChild[] = [h("rect", { x: 0, y: 0, width, height, fill: "var(--affino-diagram-ruler-background, #f4f5f3)", stroke: "var(--affino-diagram-ruler-border, #aeb8b1)" })]
      for (const tick of ticks.value) {
        const offset = (tick.world - start.value) * props.viewport.zoom
        const length = tick.major ? props.thickness * 0.55 : props.thickness * 0.3
        if (horizontal) {
          children.push(h("line", { x1: offset, x2: offset, y1: props.thickness, y2: props.thickness - length, stroke: "currentColor", "pointer-events": "none" }))
          if (tick.label) children.push(h("text", { x: offset + 2, y: 11, "font-size": 9, fill: "currentColor", "pointer-events": "none" }, tick.label))
        } else {
          children.push(h("line", { x1: props.thickness, x2: props.thickness - length, y1: offset, y2: offset, stroke: "currentColor", "pointer-events": "none" }))
          if (tick.label) children.push(h("text", { x: props.thickness - 3, y: offset - 2, "font-size": 9, "text-anchor": "end", fill: "currentColor", "pointer-events": "none" }, tick.label))
        }
      }
      if (props.label) children.push(h("text", { x: horizontal ? width - 4 : props.thickness / 2, y: horizontal ? props.thickness - 2 : 10, "font-size": 8, "text-anchor": "end", fill: "currentColor", "pointer-events": "none" }, props.label))
      if (dragPosition.value !== null) {
        const offset = (dragPosition.value - start.value) * props.viewport.zoom
        children.push(horizontal
          ? h("line", { x1: offset, x2: offset, y1: 0, y2: props.thickness, stroke: "var(--affino-diagram-guide, #d13c2f)", "stroke-width": 2, "pointer-events": "none" })
          : h("line", { x1: 0, x2: props.thickness, y1: offset, y2: offset, stroke: "var(--affino-diagram-guide, #d13c2f)", "stroke-width": 2, "pointer-events": "none" }))
      }
      return h("svg", { ...attrs, class: ["affino-diagram-ruler", attrs.class], role: "img", "aria-label": props.label ?? `${horizontal ? "Horizontal" : "Vertical"} ruler in ${props.unit}`, "data-diagram-ruler": props.axis, "data-unit": props.unit, width, height, viewBox: `0 0 ${width} ${height}`, style: { display: "block", touchAction: "none", userSelect: "none", ...attrs.style as object }, onPointerdown, onPointermove, onPointerup, onPointercancel }, children)
    }
  },
})
