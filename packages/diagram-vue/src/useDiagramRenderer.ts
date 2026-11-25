import type { DiagramRenderEntity } from "./types.js"
import type { DiagramPortCreationPreview, DiagramViewport } from "@affino/diagram-core"
import { pathContourSvg } from "@affino/diagram-core"
import type { DiagramConnectorPathCommand } from "@affino/diagram-core"
import type { DiagramConnectorRenderEntity } from "./types.js"

export type SvgEntityProps = Readonly<Record<string, string | number | boolean | undefined>>

/** Convert Core connector commands to an SVG path `d` value for the adapter's standard SVG renderer. */
export function connectorCommandsToSvgPath(commands: ReadonlyArray<DiagramConnectorPathCommand>): string {
  return commands.map((command) => {
    if (command.kind === "moveTo") return `M ${command.point.x} ${command.point.y}`
    if (command.kind === "lineTo") return `L ${command.point.x} ${command.point.y}`
    if (command.kind === "quadraticTo") return `Q ${command.control.x} ${command.control.y} ${command.point.x} ${command.point.y}`
    return `C ${command.control1.x} ${command.control1.y} ${command.control2.x} ${command.control2.y} ${command.point.x} ${command.point.y}`
  }).join(" ")
}

/** SVG attributes for one connector returned by `useDiagramConnectorRendering`. */
export function getSvgConnectorRenderProps(connector: Pick<DiagramConnectorRenderEntity, "id" | "pathData" | "bridges" | "style">): SvgEntityProps {
  return {
    d: connector.pathData,
    "data-diagram-id": connector.id,
    "data-connector-bridge-count": connector.bridges.length,
    fill: connector.style?.fill ?? "none",
    ...svgStyleProps(connector.style),
  }
}

export function getSvgJunctionRenderProps(junction: import("@affino/diagram-core").DiagramJunctionRenderGeometry): Readonly<Record<string, string | number>> | null {
  if (junction.appearance === "none") return null
  return {
    cx: junction.point.x,
    cy: junction.point.y,
    r: junction.radius,
    fill: "currentColor",
    "data-diagram-junction-id": junction.id,
    "data-diagram-host-edge-id": junction.hostEdgeId,
  }
}

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
  const style = entity.style ?? geometry.style
  const styleProps = svgStyleProps(style)
  const common = {
    "data-diagram-id": entity.id,
    "data-diagram-kind": entity.kind,
    "data-selected": entity.selected || undefined,
  }
  if (entity.kind === "edge") {
    return {
      ...common,
      ...styleProps,
      points: geometry.path?.map((point) => `${point.x},${point.y}`).join(" ") ?? "",
    }
  }
  if (entity.kind === "port") {
    const point = geometry.point ?? { x: geometry.bounds.x, y: geometry.bounds.y }
    return {
      ...common,
      ...styleProps,
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
      ...styleProps,
      ...(entity.kind === "shape" && geometry.path ? { points: geometry.path.map((point) => `${point.x},${point.y}`).join(" ") } : {}),
      ...(entity.kind === "shape" && geometry.pathContours ? { d: geometry.pathContours.map(pathContourSvg).join(" "), "fill-rule": style?.fillRule ?? "evenodd" } : {}),
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
      ...styleProps,
      x: bounds.x,
      y: bounds.y,
      transform,
    }
  }
  return common
}


function svgStyleProps(style: DiagramRenderEntity["style"]): SvgEntityProps {
  if (!style) return {}
  return {
    ...(style.fill !== undefined ? { fill: style.fill } : {}),
    ...(style.stroke !== undefined ? { stroke: style.stroke } : {}),
    ...(style.strokeWidth !== undefined ? { "stroke-width": style.strokeWidth } : {}),
    ...(style.strokeDasharray !== undefined ? { "stroke-dasharray": style.strokeDasharray } : {}),
    ...(style.fillRule !== undefined ? { "fill-rule": style.fillRule } : {}),
    ...(style.color !== undefined ? { color: style.color } : {}),
    ...(style.fontFamily !== undefined ? { "font-family": style.fontFamily } : {}),
    ...(style.fontSize !== undefined ? { "font-size": style.fontSize } : {}),
    ...(style.fontWeight !== undefined ? { "font-weight": style.fontWeight } : {}),
    ...(style.fontStyle !== undefined ? { "font-style": style.fontStyle } : {}),
  }
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
