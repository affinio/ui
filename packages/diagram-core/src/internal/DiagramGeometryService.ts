import { createEntityGeometry, resolveDiagramTableLayout } from "../geometry.js"
import type { DiagramGeometryResolutionCache, DiagramTableLayout } from "../geometry.js"
import type { DiagramEntities, DiagramGeometry, DiagramId, DiagramTable, DiagramTextMeasurementProvider } from "../types.js"
import type { GeometryCacheEntry } from "./model.js"

export class DiagramGeometryService {
  private cache = new Map<DiagramId, GeometryCacheEntry>()
  private tableLayoutCache = new Map<DiagramId, { table: DiagramTable; providers: Map<DiagramTextMeasurementProvider | null, { revision: string | number; layout: DiagramTableLayout }> }>()
  private readCount = 0
  private tableLayoutReadCount = 0

  getReadCount(): number {
    return this.readCount
  }

  getTableLayoutReadCount(): number { return this.tableLayoutReadCount }

  getTableLayout(table: DiagramTable, provider?: DiagramTextMeasurementProvider): DiagramTableLayout {
    const key = provider ?? null
    const revision = provider?.revision ?? 0
    let entry = this.tableLayoutCache.get(table.id)
    if (entry && entry.table !== table && sameTableLayoutInputs(entry.table, table)) entry.table = table
    else if (!entry || entry.table !== table) {
      entry = { table, providers: new Map() }
      this.tableLayoutCache.set(table.id, entry)
    }
    const providerLayouts = entry.providers
    const cached = providerLayouts?.get(key)
    if (cached?.revision === revision) return cached.layout
    const layout = freezeResolvedLayout(resolveDiagramTableLayout(table, { textMeasurementProvider: provider }))
    if (!providerLayouts.has(key) && providerLayouts.size >= 4) {
      const oldest = providerLayouts.keys().next().value as DiagramTextMeasurementProvider | null | undefined
      if (oldest !== undefined) providerLayouts.delete(oldest)
    }
    providerLayouts.set(key, { revision, layout })
    this.tableLayoutReadCount += 1
    return layout
  }

  get(id: DiagramId, entities: DiagramEntities, version: number, resolutionCache?: DiagramGeometryResolutionCache): DiagramGeometry | null {
    const cached = this.cache.get(id)
    if (cached?.version === version) {
      return cached.geometry
    }
    const geometry = createEntityGeometry(id, entities, resolutionCache)
    if (!geometry) {
      return null
    }
    this.readCount += 1
    this.cache.set(id, { version, geometry })
    return geometry
  }

  invalidate(ids: Iterable<DiagramId>, activeTableIds?: ReadonlySet<DiagramId>): void {
    for (const id of ids) {
      this.cache.delete(id)
      if (activeTableIds && !activeTableIds.has(id)) this.tableLayoutCache.delete(id)
    }
  }
}

function sameTableLayoutInputs(a: DiagramTable, b: DiagramTable): boolean {
  return a.x === b.x && a.y === b.y
    && a.rowCount === b.rowCount && a.columnCount === b.columnCount
    && a.cells === b.cells && a.merges === b.merges
    && a.rowHeights === b.rowHeights && a.columnWidths === b.columnWidths
    && a.defaultCell === b.defaultCell && a.style === b.style
}

function freezeResolvedLayout(layout: DiagramTableLayout): DiagramTableLayout {
  const seen = new Set<object>()
  const freeze = (value: unknown): void => {
    if (!value || typeof value !== "object" || seen.has(value)) return
    seen.add(value)
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  freeze(layout)
  return layout
}
