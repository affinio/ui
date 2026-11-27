import { computed, defineComponent, h } from "vue"
import type { PropType } from "vue"
import type { DiagramPoint, DiagramRect } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"

/** Draws a world-space cursor crosshair. The pointer adapter/application supplies its world coordinate. */
export const DiagramCursorIndicator = defineComponent({
  name: "DiagramCursorIndicator",
  props: {
    position: { type: Object as PropType<DiagramPoint | null>, default: null },
    extent: { type: Object as PropType<DiagramRect>, required: true },
    color: { type: String, default: "#4557d6" },
  },
  setup(props) {
    return () => {
      if (!props.position) return null
      return h("g", { class: "affino-diagram-cursor-indicator", "pointer-events": "none", "aria-hidden": "true" }, [
        h("line", { x1: props.position.x, x2: props.position.x, y1: props.extent.y, y2: props.extent.y + props.extent.height, stroke: props.color, "stroke-width": 1, "stroke-dasharray": "3 3", "vector-effect": "non-scaling-stroke" }),
        h("line", { x1: props.extent.x, x2: props.extent.x + props.extent.width, y1: props.position.y, y2: props.position.y, stroke: props.color, "stroke-width": 1, "stroke-dasharray": "3 3", "vector-effect": "non-scaling-stroke" }),
      ])
    }
  },
})

/** Shows the world-space union bounds for the current Core selection. */
export const DiagramSelectionExtent = defineComponent({
  name: "DiagramSelectionExtent",
  props: {
    controller: { type: Object as PropType<DiagramEngineController>, required: true },
    padding: { type: Number, default: 0 },
    color: { type: String, default: "#4557d6" },
  },
  setup(props) {
    const bounds = computed(() => {
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
      for (const id of props.controller.scene.value.selection.ids) {
        const rect = props.controller.engine.getWorldBounds(id)
        if (!rect) continue
        left = Math.min(left, rect.x); top = Math.min(top, rect.y)
        right = Math.max(right, rect.x + rect.width); bottom = Math.max(bottom, rect.y + rect.height)
      }
      if (!Number.isFinite(left)) return null
      const p = props.padding
      return { x: left - p, y: top - p, width: right - left + 2 * p, height: bottom - top + 2 * p }
    })
    return () => {
      const rect = bounds.value
      return rect ? h("rect", { class: "affino-diagram-selection-extent", ...rect, fill: "none", stroke: props.color, "stroke-width": 1, "stroke-dasharray": "4 3", "vector-effect": "non-scaling-stroke", "pointer-events": "none", "aria-hidden": "true" }) : null
    }
  },
})

/** Transient full-canvas guide shown while the user drags from a ruler. */
export const DiagramGuidePreview = defineComponent({
  name: "DiagramGuidePreview",
  props: {
    axis: { type: String as PropType<"x" | "y" | null>, default: null },
    position: { type: Number as PropType<number | null>, default: null },
    extent: { type: Object as PropType<DiagramRect>, required: true },
    color: { type: String, default: "#a92a20" },
  },
  setup(props) {
    return () => {
      if (props.axis === null || props.position === null) return null
      return props.axis === "x"
        ? h("line", { class: "affino-diagram-guide-preview", x1: props.position, x2: props.position, y1: props.extent.y, y2: props.extent.y + props.extent.height, stroke: props.color, "stroke-width": 2, "stroke-dasharray": "4 3", "vector-effect": "non-scaling-stroke", "pointer-events": "none", "aria-hidden": "true" })
        : h("line", { class: "affino-diagram-guide-preview", x1: props.extent.x, x2: props.extent.x + props.extent.width, y1: props.position, y2: props.position, stroke: props.color, "stroke-width": 2, "stroke-dasharray": "4 3", "vector-effect": "non-scaling-stroke", "pointer-events": "none", "aria-hidden": "true" })
    }
  },
})
