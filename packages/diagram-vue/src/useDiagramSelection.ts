import { computed } from "vue"
import type { ComputedRef } from "vue"
import type { DiagramId, DiagramSelection } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"

export type DiagramSelectionController = Readonly<{
  selection: ComputedRef<DiagramSelection>
  selectedIds: ComputedRef<ReadonlySet<DiagramId>>
  setSelection: (ids: ReadonlyArray<DiagramId>, primaryId?: DiagramId | null) => void
  clearSelection: () => void
  isSelected: (id: DiagramId) => boolean
}>

export function useDiagramSelection(controller: DiagramEngineController): DiagramSelectionController {
  const selection = computed(() => controller.scene.value.selection)
  const selectedIds = computed(() => new Set(selection.value.ids))
  return {
    selection,
    selectedIds,
    setSelection: (ids, primaryId = ids[0] ?? null) => controller.dispatch({ type: "setSelection", selection: { ids, primaryId } }),
    clearSelection: () => controller.dispatch({ type: "setSelection", selection: { ids: [], primaryId: null } }),
    isSelected: (id) => selectedIds.value.has(id),
  }
}
