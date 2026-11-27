import type { DiagramPointerEvent, DiagramResizeHandle } from "@affino/diagram-core"
import type { DiagramHandle } from "@affino/diagram-vue"
import type { DiagramInteractionController } from "@affino/diagram-core"

export function beginDiagramHandleInteraction(
  interaction: DiagramInteractionController,
  handle: DiagramHandle,
  event: DiagramPointerEvent,
): boolean {
  if (handle.kind === "edge-endpoint") {
    const endpoint = handle.id.endsWith(":source") ? "source" : handle.id.endsWith(":target") ? "target" : null
    return endpoint ? interaction.beginEdgeEndpointHandle(handle.ownerId, endpoint, event) : false
  }
  if (handle.kind === "edge-segment" && handle.segmentIndex !== undefined) return interaction.beginEdgeSegmentHandle(handle.ownerId, handle.segmentIndex, event)
  if (handle.kind === "waypoint" && handle.segmentIndex !== undefined) return interaction.beginEdgeWaypointHandle(handle.ownerId, handle.segmentIndex, event)
  if (handle.kind === "path-vertex") {
    const index = Number(handle.id.slice(handle.id.lastIndexOf(":") + 1))
    return Number.isInteger(index) ? interaction.beginPathVertexHandle(handle.ownerId, index, event) : false
  }
  if (handle.bezierHandle && handle.contourIndex !== undefined && handle.segmentIndex !== undefined) {
    return interaction.beginBezierHandle(handle.ownerId, handle.contourIndex, handle.segmentIndex, handle.bezierHandle, event, handle.anchorSide)
  }
  if (handle.kind !== "resize") return false
  const resizeHandle = handle.resizeHandle ?? handle.id.slice(handle.id.lastIndexOf(":") + 1) as DiagramResizeHandle
  return handle.ownerId === "__selection__"
    ? interaction.beginResizeSelectionHandle(resizeHandle, event)
    : interaction.beginResizeHandle(handle.ownerId, resizeHandle, event)
}
