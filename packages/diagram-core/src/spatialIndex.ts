import { rectIntersects } from "./geometry.js"
import type { DiagramGeometry, DiagramId, DiagramRect } from "./types.js"

type GridEntry = Readonly<{
  id: DiagramId
  bounds: DiagramRect
}>

export class UniformGridIndex {
  private readonly cellSize: number
  private cells = new Map<string, Set<DiagramId>>()
  private entries = new Map<DiagramId, GridEntry>()

  constructor(cellSize = 256) {
    this.cellSize = cellSize
  }

  rebuild(geometries: Iterable<DiagramGeometry>, useHitBounds = false): void {
    this.cells.clear()
    this.entries.clear()
    for (const geometry of geometries) {
      this.insert(geometry.id, useHitBounds ? geometry.hitBounds : geometry.bounds)
    }
  }

  query(rect: DiagramRect): DiagramId[] {
    const ids = new Set<DiagramId>()
    for (const key of this.keysForRect(rect)) {
      const bucket = this.cells.get(key)
      if (!bucket) {
        continue
      }
      for (const id of bucket) {
        ids.add(id)
      }
    }
    return [...ids].filter((id) => {
      const entry = this.entries.get(id)
      return entry ? rectIntersects(entry.bounds, rect) : false
    })
  }

  private insert(id: DiagramId, bounds: DiagramRect): void {
    this.entries.set(id, { id, bounds })
    for (const key of this.keysForRect(bounds)) {
      let bucket = this.cells.get(key)
      if (!bucket) {
        bucket = new Set()
        this.cells.set(key, bucket)
      }
      bucket.add(id)
    }
  }

  private keysForRect(rect: DiagramRect): string[] {
    const minX = Math.floor(rect.x / this.cellSize)
    const maxX = Math.floor((rect.x + Math.max(0, rect.width)) / this.cellSize)
    const minY = Math.floor(rect.y / this.cellSize)
    const maxY = Math.floor((rect.y + Math.max(0, rect.height)) / this.cellSize)
    const keys: string[] = []
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        keys.push(`${x}:${y}`)
      }
    }
    return keys
  }
}
