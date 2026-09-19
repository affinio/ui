import type { DiagramRenderEntity } from "./types.js"
import type { DiagramViewport } from "@affino/diagram-core"

export type SvgEntityProps = Readonly<Record<string, string | number | boolean | undefined>>

export function getSvgEntityProps(entity: DiagramRenderEntity): SvgEntityProps {
  const { geometry } = entity
  const bounds = geometry.unrotatedBounds ?? geometry.bounds
  const transform = geometry.rotation
    ? "rotate(" + geometry.rotation + " " + (bounds.x + bounds.width / 2) + " " + (bounds.y + bounds.height / 2) + ")"
    : undefined
  const common = {
    "data-diagram-id": entity.id,
    "data-diagram-kind": entity.kind,
    "data-selected": entity.selected || undefined,
  }
  if (entity.kind === "edge") {
    return {
      ...common,
      points: geometry.path?.map((point) => `${point.x},${point.y}`).join(" ") ?? "",
    }
  }
  if (entity.kind === "port") {
    const point = geometry.point ?? { x: geometry.bounds.x, y: geometry.bounds.y }
    return {
      ...common,
      cx: point.x,
      cy: point.y,
      r: geometry.bounds.width / 2,
    }
  }
  if (entity.kind === "shape" || entity.kind === "node") {
    return {
      ...common,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      transform,
    }
  }
  if (entity.kind === "text") {
    return {
      ...common,
      x: bounds.x,
      y: bounds.y,
      transform,
    }
  }
  return common
}

export function getDomEntityStyle(entity: DiagramRenderEntity, viewport?: DiagramViewport): Readonly<Record<string, string>> {
  const bounds = entity.geometry.unrotatedBounds ?? entity.geometry.bounds
  const zoom = viewport?.zoom ?? 1
  const left = viewport ? (bounds.x - viewport.x) * zoom : bounds.x
  const top = viewport ? (bounds.y - viewport.y) * zoom : bounds.y
  const rotation = entity.geometry.rotation ? " rotate(" + entity.geometry.rotation + "deg)" : ""
  return Object.freeze({
    position: "absolute",
    transform: "translate(" + left + "px, " + top + "px)" + rotation,
    width: bounds.width * zoom + "px",
    height: bounds.height * zoom + "px",
    ...(rotation ? { transformOrigin: "center center" } : {}),
  })
}
