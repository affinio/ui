import { UniformGridIndex } from "../spatialIndex.js"
import type { DiagramGeometry, DiagramId, DiagramRect } from "../types.js"

export class DiagramSpatialIndex {
  private visualBoundsIndex = new UniformGridIndex()
  private hitBoundsIndex = new UniformGridIndex()
  private portIndex = new UniformGridIndex(128)
  private dirty = true

  markDirty(): void {
    this.dirty = true
  }

  ensure(rebuild: () => ReadonlyArray<DiagramGeometry>): void {
    if (!this.dirty) {
      return
    }
    const geometries = rebuild()
    this.visualBoundsIndex.rebuild(geometries)
    this.hitBoundsIndex.rebuild(geometries, true)
    this.portIndex.rebuild(geometries.filter((geometry) => geometry.kind === "port"), true)
    this.dirty = false
  }

  update(geometries: ReadonlyArray<DiagramGeometry>, removedIds: ReadonlyArray<DiagramId> = []): void {
    if (this.dirty) {
      this.visualBoundsIndex.rebuild(geometries)
      this.hitBoundsIndex.rebuild(geometries, true)
      this.portIndex.rebuild(geometries.filter((geometry) => geometry.kind === "port"), true)
      this.dirty = false
      return
    }
    this.visualBoundsIndex.update(geometries, false, removedIds)
    this.hitBoundsIndex.update(geometries, true, removedIds)
    this.portIndex.update(geometries.filter((geometry) => geometry.kind === "port"), true, removedIds)
  }

  queryVisible(bounds: DiagramRect): DiagramId[] {
    return this.visualBoundsIndex.query(bounds)
  }

  queryHit(bounds: DiagramRect): DiagramId[] {
    return this.hitBoundsIndex.query(bounds)
  }

  queryPorts(bounds: DiagramRect): DiagramId[] {
    return this.portIndex.query(bounds)
  }
}
