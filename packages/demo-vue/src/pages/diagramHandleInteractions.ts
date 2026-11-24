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
  if (handle.kind !== "resize") return false
  const resizeHandle = handle.resizeHandle ?? handle.id.slice(handle.id.lastIndexOf(":") + 1) as DiagramResizeHandle
  return handle.ownerId === "__selection__"
    ? interaction.beginResizeSelectionHandle(resizeHandle, event)
    : interaction.beginResizeHandle(handle.ownerId, resizeHandle, event)
}
