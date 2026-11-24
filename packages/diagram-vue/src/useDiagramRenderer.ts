import type { DiagramRenderEntity } from "./types.js"
import type { DiagramPortCreationPreview, DiagramViewport } from "@affino/diagram-core"
import { pathContourSvg } from "@affino/diagram-core"

export type SvgEntityProps = Readonly<Record<string, string | number | boolean | undefined>>

/** SVG circle attributes for rendering the transient Core port-placement marker. */
export function getSvgPortCreationPreviewProps(preview: DiagramPortCreationPreview, radius = 5): SvgEntityProps {
  return {
    cx: preview.point.x,
    cy: preview.point.y,
    r: radius,
    "data-port-preview-id": preview.id,
    "data-port-host-id": preview.hostId,
    "data-port-anchor-kind": preview.anchor.kind,
    "data-port-anchor-index": preview.anchor.kind === "vertex" ? preview.anchor.index : undefined,
    "data-port-anchor-x": preview.anchor.kind === "local" ? preview.anchor.x : undefined,
    "data-port-anchor-y": preview.anchor.kind === "local" ? preview.anchor.y : undefined,
    "pointer-events": "none",
    "aria-hidden": true,
  }
}

export function getSvgEntityProps(entity: DiagramRenderEntity): SvgEntityProps {
  const { geometry } = entity
  const bounds = geometry.unrotatedBounds ?? geometry.bounds
  const transform = svgTransform(geometry.rotation ?? 0, geometry.flipX === true, geometry.flipY === true, bounds)
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
      "data-port-host-id": geometry.hostId,
      "data-port-anchor-kind": geometry.anchor?.kind,
      "data-port-anchor-x": geometry.anchor?.kind === "local" ? geometry.anchor.x : undefined,
      "data-port-anchor-y": geometry.anchor?.kind === "local" ? geometry.anchor.y : undefined,
      "data-port-anchor-index": geometry.anchor?.kind === "vertex" ? geometry.anchor.index : undefined,
    }
  }
  if (entity.kind === "shape" || entity.kind === "node" || entity.kind === "table") {
    return {
      ...common,
      ...(entity.kind === "shape" && geometry.path ? { points: geometry.path.map((point) => `${point.x},${point.y}`).join(" ") } : {}),
      ...(entity.kind === "shape" && geometry.pathContours ? { d: geometry.pathContours.map(pathContourSvg).join(" "), "fill-rule": "evenodd" } : {}),
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      ...(entity.kind === "shape" ? { rx: geometry.cornerRadius ?? 0, ry: geometry.cornerRadius ?? 0 } : {}),
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
  const flip = entity.geometry.flipX || entity.geometry.flipY
    ? " scale(" + (entity.geometry.flipX ? -1 : 1) + ", " + (entity.geometry.flipY ? -1 : 1) + ")"
    : ""
  return Object.freeze({
    position: "absolute",
    transform: "translate(" + left + "px, " + top + "px)" + rotation + flip,
    width: bounds.width * zoom + "px",
    height: bounds.height * zoom + "px",
    ...(rotation || flip ? { transformOrigin: "center center" } : {}),
  })
}

export function svgTransform(rotation: number, flipX: boolean, flipY: boolean, bounds: Readonly<{ x: number; y: number; width: number; height: number }>): string | undefined {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const transforms: string[] = []
  if (rotation) transforms.push(`rotate(${rotation} ${centerX} ${centerY})`)
  if (flipX || flipY) transforms.push(`translate(${centerX} ${centerY}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1}) translate(${-centerX} ${-centerY})`)
  return transforms.length ? transforms.join(" ") : undefined
}
