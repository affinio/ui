# Affino incremental updates handoff

## Available source change

TreeView source changes are in `@affino/treeview-core@0.4.0` and `@affino/treeview-vue@0.4.0` (prepared versions; no npm publication is claimed). Integrate from this checkout with the repository's workspace dependency, or build both packages with `pnpm --filter @affino/treeview-core build` and `pnpm --filter @affino/treeview-vue build`.

## TreeView API

```ts
import { TreeviewCore, type TreeviewRegisterResult } from "@affino/treeview-core"
import { useTreeviewController, useVirtualTreeviewController } from "@affino/treeview-vue"

// TreeviewCore<Value> and both Vue controllers expose:
removeNodes(values: ReadonlyArray<Value>): TreeviewRegisterResult
batch<T>(callback: () => T): T
```

`removeNodes` removes each requested node and all descendants. Unknown IDs are ignored. The closest surviving ancestor becomes active/selected when the corresponding node is removed, or `null` if no ancestor survives. Siblings retain their relative order. Search is rebuilt against the remaining nodes, including ancestor paths and match count. A structural update preserves state for unaffected nodes; visible projection is rebuilt as needed. `batch` applies operations synchronously, supports nesting, and emits one final snapshot. It does not roll back if the callback throws: applied changes remain and observers receive the final state before the error propagates. A no-op removal emits no update. The virtual Vue controller synchronously refreshes its exposed rows on a core notification; scroll-only refreshes are frame-coalesced. It cancels pending frames on disposal.

```ts
const tree = new TreeviewCore<string>({ nodes: [{ value: "root", parent: null }] })
tree.batch(() => {
  tree.registerNodes([{ value: "child", parent: "root", text: "Child" }], { mode: "patch" })
  tree.removeNodes(["old-id"])
})
tree.registerNodes([{ value: "renamed", parent: "root", text: "Renamed" }], { mode: "patch" })
tree.removeNodes(["child"])
```

## DataGrid and consumer handoff status

The checked-out workspace contains no DataGrid source packages, IEC 61850 Driver Wizard repository, or consumer `docs/` destination. Therefore this handoff does not define or claim a DataGrid delta event, row-delta API, benchmark result, DataGrid version, or consumer installation. Those changes require the corresponding source repository and a follow-up integration copy to the consumer repository. No npm release was made.

## Validation and remaining work

TreeView package builds and tests passed in this workspace: `pnpm --filter @affino/treeview-core build`, `pnpm --filter @affino/treeview-vue build`, `pnpm --filter @affino/treeview-core test` (36 tests), and `pnpm --filter @affino/treeview-vue test` (13 tests). No 1k/10k/50k mutation benchmark was run for this change, so no performance claim is made. Regression coverage currently exercises subtree removal, unknown IDs, selected/active ancestor fallback, mixed nested mutation notifications, and no-op notification suppression. Per-entry index maintenance, move-specific coverage, and browser render measurements remain open.
