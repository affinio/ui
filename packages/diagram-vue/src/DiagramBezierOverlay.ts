import { defineComponent, h } from "vue"
import type { PropType, VNodeChild } from "vue"
import { pathContourSvg } from "@affino/diagram-core"
import type { DiagramHandle } from "./types.js"
import type { DiagramPointerController } from "./useDiagramPointerController.js"

/** SVG overlay for transient Bézier drafts and selected-path tangent handles. Mount inside the diagram's world-coordinate SVG group. */
export const DiagramBezierOverlay = defineComponent({
  name: "DiagramBezierOverlay",
  props: {
    pointer: { type: Object as PropType<DiagramPointerController>, required: true },
    handles: { type: Array as PropType<ReadonlyArray<DiagramHandle>>, default: () => [] },
    zoom: { type: Number, default: 1 },
  },
  setup(props) {
    return () => {
      const snapshot = props.pointer.state.value
      const preview = snapshot.bezierCreationPreview
      const edit = snapshot.bezierHandlePreview
      const handleSize = 5 / Math.max(props.zoom, 0.01)
      const children: VNodeChild[] = []
      const contour = preview?.contour
      if (preview && contour?.segments.length) children.push(h("path", {
        d: pathContourSvg(contour), fill: "none", stroke: "var(--affino-diagram-bezier-preview, var(--affino-accent, #3b82f6))",
        "stroke-width": 2 / Math.max(props.zoom, 0.01), "stroke-dasharray": "6 4", "pointer-events": "none", "data-bezier-preview": preview.id,
      }))
      if (edit) children.push(h("path", {
        d: edit.contours.map(pathContourSvg).join(" "), fill: "none", stroke: "var(--affino-diagram-bezier-preview, var(--affino-accent, #3b82f6))",
        "stroke-width": 2 / Math.max(props.zoom, 0.01), "pointer-events": "none", "data-bezier-edit-preview": edit.id,
      }))
      if (preview) {
        for (const anchor of preview.anchors) children.push(h("circle", {
          cx: anchor.point.x, cy: anchor.point.y, r: handleSize, fill: "var(--affino-surface, #fff)", stroke: "var(--affino-accent, #3b82f6)",
          "stroke-width": 1.5 / Math.max(props.zoom, 0.01), "pointer-events": "none", "data-bezier-anchor": preview.id,
        }))
        if (preview.activeAnchor) {
          const active = preview.activeAnchor
          children.push(h("path", { d: `M ${active.incoming.x} ${active.incoming.y} L ${active.point.x} ${active.point.y} L ${active.outgoing.x} ${active.outgoing.y}`, fill: "none", stroke: "var(--affino-diagram-bezier-guide, #8b93a1)", "stroke-dasharray": "3 3", "pointer-events": "none" }))
          for (const point of [active.point, active.incoming, active.outgoing]) children.push(h("circle", { cx: point.x, cy: point.y, r: handleSize, fill: "var(--affino-surface, #fff)", stroke: "var(--affino-accent, #3b82f6)", "stroke-width": 1.5 / Math.max(props.zoom, 0.01), "pointer-events": "none" }))
        }
      }
      const groupedHandles = new Map<string, DiagramHandle[]>()
      for (const handle of props.handles) {
        if (handle.contourIndex === undefined || handle.segmentIndex === undefined || !handle.bezierHandle) continue
        const key = `${handle.ownerId}:${handle.contourIndex}:${handle.segmentIndex}`
        groupedHandles.set(key, [...(groupedHandles.get(key) ?? []), handle])
      }
      for (const group of groupedHandles.values()) {
        const anchor = group.find((handle) => handle.bezierHandle === "anchor" && handle.anchorSide === "end")
        const incoming = group.find((handle) => handle.bezierHandle === "incoming")
        const outgoing = group.find((handle) => handle.bezierHandle === "outgoing")
        if (anchor && incoming) children.push(h("path", { d: `M ${anchor.point.x} ${anchor.point.y} L ${incoming.point.x} ${incoming.point.y}`, stroke: "var(--affino-diagram-bezier-guide, #8b93a1)", "stroke-dasharray": "3 3", fill: "none", "pointer-events": "none" }))
        if (outgoing) {
          const startAnchor = props.handles.find((handle) => handle.ownerId === outgoing.ownerId && handle.contourIndex === outgoing.contourIndex && handle.bezierHandle === "anchor" && Math.abs(handle.point.x - outgoing.point.x) < 1e-8 && Math.abs(handle.point.y - outgoing.point.y) < 1e-8)
          if (startAnchor) children.push(h("path", { d: `M ${outgoing.point.x} ${outgoing.point.y} L ${startAnchor.point.x} ${startAnchor.point.y}`, stroke: "var(--affino-diagram-bezier-guide, #8b93a1)", "stroke-dasharray": "3 3", fill: "none", "pointer-events": "none" }))
        }
      }
      for (const handle of props.handles) {
        if (!handle.bezierHandle || handle.contourIndex === undefined || handle.segmentIndex === undefined) continue
        children.push(h("circle", {
          cx: handle.point.x, cy: handle.point.y, r: handleSize,
          fill: handle.kind === "bezier-anchor" ? "var(--affino-surface, #fff)" : "var(--affino-accent, #3b82f6)",
          stroke: "var(--affino-accent, #3b82f6)", "stroke-width": 1.5 / Math.max(props.zoom, 0.01),
          tabindex: 0, role: "slider", "aria-label": `${handle.bezierHandle} handle ${handle.segmentIndex + 1}`,
          "data-bezier-handle": handle.bezierHandle,
          onPointerdown: (event: PointerEvent) => { event.stopPropagation(); event.preventDefault(); props.pointer.beginBezierHandle(handle.ownerId, handle.contourIndex!, handle.segmentIndex!, handle.bezierHandle!, event, handle.anchorSide) },
        }))
      }
      return h("g", { "data-diagram-bezier-overlay": "true" }, children)
    }
  },
})
