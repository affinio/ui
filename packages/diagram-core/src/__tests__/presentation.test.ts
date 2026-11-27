import { describe, expect, it } from "vitest"
import { createDiagramDocumentPresentationSource, createDiagramEngine, createDiagramEnginePresentationSource } from ".."
import type { DiagramSceneInput } from ".."

describe("DiagramPresentationSource", () => {
  it("provides isolated read-only document contexts with presented geometry and table layout", () => {
    const input: DiagramSceneInput = {
      texts: [{ id: "same", kind: "text", x: 0, y: 0, text: "Authoritative" }],
      tables: [{ id: "table", kind: "table", x: 0, y: 30, width: 80, height: 30, rowCount: 1, columnCount: 2, cells: [[{ id: "anchor", text: "A" }, { id: "covered", text: "B" }]], merges: [{ anchorCellId: "anchor", rowSpan: 1, columnSpan: 2 }] }],
      viewport: { x: 0, y: 0, width: 200, height: 100, zoom: 1 },
    }
    const serializedBefore = JSON.stringify(input)
    const first = createDiagramDocumentPresentationSource(input)
    const second = createDiagramDocumentPresentationSource(input)
    const firstOverrides = { textByEntityId: new Map([["same", "A much longer presented label"]]), textByTableCellId: new Map([["table", new Map([["anchor", "Resolved merged value"], ["covered", "ignored"]])]]) }
    const secondOverrides = { textByEntityId: new Map([["same", ""]]) }

    expect(first.sourceId).not.toBe(second.sourceId)
    expect(first.readonly).toBe(true)
    expect("dispatch" in first).toBe(false)
    expect(first.getPresentedGeometrySnapshot("same", firstOverrides)?.bounds.width).toBeGreaterThan(first.getGeometrySnapshot("same")!.bounds.width)
    // Text content changes are renderer data; layout geometry remains authoritative unless explicit dimensions are supplied.
    const emptyBounds = second.getPresentedGeometrySnapshot("same", secondOverrides)?.bounds.width ?? 0
    expect(emptyBounds).toBeGreaterThan(0)
    expect(emptyBounds).toBeLessThan(first.getGeometrySnapshot("same")!.bounds.width)
    const layout = first.getPresentedTableLayout("table", { contentOverrides: firstOverrides })!
    expect(layout.visibleCells).toHaveLength(1)
    expect(layout.visibleCells[0]?.text).toBe("Resolved merged value")
    expect(first.getScene().entities.textsById.get("same")?.text).toBe("Authoritative")
    expect(JSON.stringify(input)).toBe(serializedBefore)
    expect(first.getScene().revision).toBe(0)
    first.dispose()
    expect(() => first.getScene()).toThrow(/disposed/)
    expect(second.getScene().entities.textsById.get("same")?.text).toBe("Authoritative")
    second.dispose()
  })

  it("exposes an engine as read-only without taking engine ownership", () => {
    const engine = createDiagramEngine({ shapes: [{ id: "duplicate", kind: "shape", shape: "rect", x: 0, y: 0, width: 10, height: 10 }] })
    const source = createDiagramEnginePresentationSource(engine)
    expect("dispatch" in source).toBe(false)
    expect(source.getGeometrySnapshot("duplicate")?.kind).toBe("shape")
    source.dispose()
    expect(engine.getGeometrySnapshot("duplicate")?.kind).toBe("shape")
  })
})
