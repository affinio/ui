import type { DiagramRenderEntity } from "./types.js"

export type SvgEntityProps = Readonly<Record<string, string | number | boolean | undefined>>

export function getSvgEntityProps(entity: DiagramRenderEntity): SvgEntityProps {
  const { geometry } = entity
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
      x: geometry.bounds.x,
      y: geometry.bounds.y,
      width: geometry.bounds.width,
      height: geometry.bounds.height,
    }
  }
  if (entity.kind === "text") {
    return {
      ...common,
      x: geometry.bounds.x,
      y: geometry.bounds.y,
    }
  }
  return common
}

export function getDomEntityStyle(entity: DiagramRenderEntity): Readonly<Record<string, string>> {
  const bounds = entity.geometry.bounds
  return Object.freeze({
    position: "absolute",
    transform: `translate(${bounds.x}px, ${bounds.y}px)`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  })
}
