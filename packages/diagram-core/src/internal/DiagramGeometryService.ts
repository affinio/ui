import { createEntityGeometry } from "../geometry.js"
import type { DiagramEntities, DiagramGeometry, DiagramId } from "../types.js"
import type { GeometryCacheEntry } from "./model.js"

export class DiagramGeometryService {
  private cache = new Map<DiagramId, GeometryCacheEntry>()
  private readCount = 0

  getReadCount(): number {
    return this.readCount
  }

  get(id: DiagramId, entities: DiagramEntities, version: number): DiagramGeometry | null {
    const cached = this.cache.get(id)
    if (cached?.version === version) {
      return cached.geometry
    }
    const geometry = createEntityGeometry(id, entities)
    if (!geometry) {
      return null
    }
    this.readCount += 1
    this.cache.set(id, { version, geometry })
    return geometry
  }

  invalidate(ids: Iterable<DiagramId>): void {
    for (const id of ids) {
      this.cache.delete(id)
    }
  }
}
