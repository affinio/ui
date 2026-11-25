import type { DiagramClipboard, DiagramEdge, DiagramEdgeEndpoint, DiagramGroup, DiagramId, DiagramJunction, DiagramNode, DiagramPoint, DiagramSelection, DiagramShape, DiagramTable, DiagramText } from "../types.js"
import { diagramPortHostId } from "../geometry.js"
import type { InternalState, Patch } from "./model.js"

type DeletePatchFactory = (ids: ReadonlyArray<DiagramId>) => Patch
type NormalizeSelection = (selection: Partial<DiagramSelection> | undefined) => DiagramSelection

export class DiagramClipboardService {
  exportSubgraph(state: InternalState, ids: ReadonlyArray<DiagramId>, normalizeSelection: NormalizeSelection): DiagramClipboard {
    const selected = new Set<DiagramId>()
    for (const id of ids) {
      const group = state.entities.groupsById.get(id)
      if (group) {
        selected.add(id)
        for (const childId of group.childIds) selected.add(childId)
        continue
      }
      const owner = [...state.entities.groupsById.values()].find((candidate) => candidate.childIds.includes(id))
      if (owner) {
        selected.add(owner.id)
        for (const childId of owner.childIds) selected.add(childId)
      } else selected.add(id)
    }
    for (const edge of state.entities.edgesById.values()) {
      if (!selected.has(edge.id)) continue
      for (const endpoint of [edge.source, edge.target]) {
        if (endpoint.kind !== "junction") continue
        const junction = state.entities.junctionsById.get(endpoint.junctionId)
        if (junction) { selected.add(junction.id); selected.add(junction.hostEdgeId) }
      }
    }
    for (const junction of state.entities.junctionsById.values()) if (selected.has(junction.hostEdgeId)) selected.add(junction.id)
    const groups = state.order.groupIds
      .map((id) => state.entities.groupsById.get(id))
      .filter((group): group is DiagramGroup => group !== undefined && selected.has(group.id))
    const nodes = state.order.nodeIds
      .map((id) => state.entities.nodesById.get(id))
      .filter((entity): entity is DiagramNode => entity !== undefined && selected.has(entity.id))
    const ports = [...state.entities.portsById.values()].filter((port) => selected.has(port.id) || selected.has(diagramPortHostId(port)))
    const junctions = [...state.entities.junctionsById.values()].filter((junction) => selected.has(junction.id) || selected.has(junction.hostEdgeId))
    const included = new Set<DiagramId>([...selected, ...ports.map((port) => port.id), ...junctions.map((junction) => junction.id)])
    const edges = state.order.edgeIds
      .map((id) => state.entities.edgesById.get(id))
      .filter((edge): edge is DiagramEdge => edge !== undefined && (selected.has(edge.id) || (endpointIncluded(edge.source, included) && endpointIncluded(edge.target, included))))
    return {
      nodes,
      ports,
      junctions,
      edges,
      texts: state.order.textIds
        .map((id) => state.entities.textsById.get(id))
        .filter((entity): entity is DiagramText => entity !== undefined && selected.has(entity.id)),
      shapes: state.order.shapeIds
        .map((id) => state.entities.shapesById.get(id))
        .filter((entity): entity is DiagramShape => entity !== undefined && selected.has(entity.id)),
      tables: state.order.tableIds.map((id) => state.entities.tablesById.get(id)).filter((entity): entity is DiagramTable => entity !== undefined && selected.has(entity.id)),
      groups,
      selection: normalizeSelection({ ids: [...selected], primaryId: state.selection.primaryId }),
      viewport: state.viewport,
    }
  }

  createPastePatch(state: InternalState, clipboard: DiagramClipboard, offset: DiagramPoint, createDeletePatch: DeletePatchFactory, normalizeSelection: NormalizeSelection): Patch | null {
    const remap = new Map<DiagramId, DiagramId>()
    const reserve = (id: DiagramId) => {
      const next = uniqueId(state, `${id}-copy`, remap.size + 1)
      remap.set(id, next)
      return next
    }
    for (const entity of [...clipboard.nodes, ...clipboard.ports, ...clipboard.edges, ...clipboard.texts, ...clipboard.shapes, ...(clipboard.groups ?? []), ...(clipboard.tables ?? []), ...(clipboard.junctions ?? [])]) reserve(entity.id)
    const nodes = clipboard.nodes.map((node) => ({ ...node, id: remap.get(node.id)!, x: node.x + offset.x, y: node.y + offset.y, portIds: node.portIds?.map((id) => remap.get(id) ?? id) }))
    const ports = clipboard.ports.map((port) => {
      if ("nodeId" in port && port.nodeId) return { id: remap.get(port.id)!, kind: "port" as const, metadata: port.metadata, radius: port.radius, nodeId: remap.get(port.nodeId) ?? port.nodeId, x: port.x, y: port.y }
      const anchored = port as Extract<typeof port, { hostId: string }>
      return { id: remap.get(port.id)!, kind: "port" as const, metadata: port.metadata, radius: port.radius, hostId: remap.get(anchored.hostId) ?? anchored.hostId, anchor: anchored.anchor }
    })
    const edges = clipboard.edges.map((edge) => ({ ...edge, id: remap.get(edge.id)!, source: remapEndpoint(edge.source, remap, offset), target: remapEndpoint(edge.target, remap, offset), points: edge.points?.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })), ...(edge.routing?.mode === "auto" && edge.routing.waypoints ? { routing: { ...edge.routing, waypoints: edge.routing.waypoints.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })) } } : {}) }))
    const junctions = (clipboard.junctions ?? []).map((junction): DiagramJunction => ({ ...junction, id: remap.get(junction.id)!, hostEdgeId: remap.get(junction.hostEdgeId) ?? junction.hostEdgeId }))
    const texts = clipboard.texts.map((text) => ({ ...text, id: remap.get(text.id)!, x: text.x + offset.x, y: text.y + offset.y }))
    const shapes = clipboard.shapes.map((shape) => ({ ...shape, id: remap.get(shape.id)!, x: shape.x + offset.x, y: shape.y + offset.y }))
    const groups = (clipboard.groups ?? []).map((group) => ({ ...group, id: remap.get(group.id)!, childIds: group.childIds.map((id) => remap.get(id) ?? id) }))
    const tables = (clipboard.tables ?? []).map((table) => ({ ...table, id: remap.get(table.id)!, x: table.x + offset.x, y: table.y + offset.y }))
    const pastedIds = [...nodes, ...ports, ...edges, ...texts, ...shapes, ...groups, ...tables, ...junctions].map((entity) => entity.id)
    if (!pastedIds.length) return null
    return {
      orderChanged: true,
      apply: (next) => {
        for (const node of nodes) { next.entities.nodesById.set(node.id, node); next.order.nodeIds.push(node.id); next.versions.set(node.id, 0) }
        for (const port of ports) { next.entities.portsById.set(port.id, port); next.versions.set(port.id, 0) }
        for (const edge of edges) { next.entities.edgesById.set(edge.id, edge); next.order.edgeIds.push(edge.id); next.versions.set(edge.id, 0) }
        for (const junction of junctions) { next.entities.junctionsById.set(junction.id, junction); next.versions.set(junction.id, 0) }
        for (const text of texts) { next.entities.textsById.set(text.id, text); next.order.textIds.push(text.id); next.versions.set(text.id, 0) }
        for (const shape of shapes) { next.entities.shapesById.set(shape.id, shape); next.order.shapeIds.push(shape.id); next.versions.set(shape.id, 0) }
        for (const group of groups) { next.entities.groupsById.set(group.id, group); next.order.groupIds.push(group.id); next.versions.set(group.id, 0) }
        for (const table of tables) { next.entities.tablesById.set(table.id, table); next.order.tableIds.push(table.id); next.versions.set(table.id, 0) }
        const selectedIds = groups.length ? groups.map((group) => group.id) : pastedIds.filter((id) => !next.entities.portsById.has(id) && !next.entities.junctionsById.has(id))
        next.selection = normalizeSelection({ ids: selectedIds, primaryId: groups[0]?.id ?? nodes[0]?.id ?? texts[0]?.id ?? shapes[0]?.id ?? edges[0]?.id ?? null })
        return new Set([...pastedIds, "selection"])
      },
      inverse: createDeletePatch(pastedIds),
    }
  }
}

function endpointIncluded(endpoint: DiagramEdgeEndpoint, ids: ReadonlySet<DiagramId>): boolean {
  if (endpoint.kind === "point") return true
  if (endpoint.kind === "node") return ids.has(endpoint.nodeId)
  return endpoint.kind === "port" ? ids.has(endpoint.portId) : ids.has(endpoint.junctionId)
}

function remapEndpoint(endpoint: DiagramEdgeEndpoint, remap: ReadonlyMap<DiagramId, DiagramId>, offset: DiagramPoint): DiagramEdgeEndpoint {
  if (endpoint.kind === "point") return { kind: "point", point: { x: endpoint.point.x + offset.x, y: endpoint.point.y + offset.y } }
  if (endpoint.kind === "node") return { kind: "node", nodeId: remap.get(endpoint.nodeId) ?? endpoint.nodeId }
  if (endpoint.kind === "port") return { kind: "port", portId: remap.get(endpoint.portId) ?? endpoint.portId }
  return { kind: "junction", junctionId: remap.get(endpoint.junctionId) ?? endpoint.junctionId }
}

function uniqueId(state: InternalState, base: string, seed: number): DiagramId {
  let id = `${base}-${seed}`
  let index = seed
  while (hasEntity(state, id)) {
    index += 1
    id = `${base}-${index}`
  }
  return id
}

function hasEntity(state: InternalState, id: DiagramId): boolean {
  return state.entities.nodesById.has(id) || state.entities.edgesById.has(id) || state.entities.textsById.has(id) || state.entities.shapesById.has(id) || state.entities.portsById.has(id) || state.entities.junctionsById.has(id) || state.entities.groupsById.has(id) || state.entities.tablesById.has(id)
}
