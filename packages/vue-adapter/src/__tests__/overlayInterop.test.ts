import { describe, expect, it } from "vitest"
import { effectScope, nextTick } from "vue"
import { getDocumentOverlayManager } from "@affino/overlay-kernel"
import { useDialogController } from "@affino/dialog-vue"
import { usePopoverController } from "@affino/popover-vue"
import { useTooltipController } from "@affino/tooltip-vue"
import { useMenuController } from "../../../menu-vue/src/useMenuController"
import { bootstrapAffinoVueAdapters, createAffinoVueAdapter } from "../index"

describe("vue-adapter overlay interop", () => {
  it("preserves deterministic top-layer ordering across dialog/menu/popover/tooltip", () => {
    const manager = getDocumentOverlayManager(document)
    const scope = effectScope()
    let dialog!: ReturnType<typeof useDialogController>
    let menu!: ReturnType<typeof useMenuController>
    let popover!: ReturnType<typeof usePopoverController>
    let tooltip!: ReturnType<typeof useTooltipController>

    scope.run(() => {
      dialog = useDialogController({
        overlayEntryTraits: { priority: 100 },
      })
      menu = useMenuController({
        kind: "root",
        options: { overlayEntryTraits: { priority: 70 } },
      })
      popover = usePopoverController({
        overlayEntryTraits: { priority: 40 },
      })
      tooltip = useTooltipController({
        overlayEntryTraits: { priority: 10 },
      })
    })

    dialog.open("programmatic")
    menu.open("programmatic")
    popover.open("programmatic")
    tooltip.open("programmatic")

    const stack = manager.getStack()
    expect(stack.length).toBeGreaterThanOrEqual(4)
    expect(stack.at(-1)?.kind).toBe("dialog")

    tooltip.close("programmatic")
    popover.close("programmatic")
    menu.close("programmatic")

    expect(manager.getStack().at(-1)?.kind).toBe("dialog")

    scope.stop()
  })

  it("emits stack updates via adapter subscription as overlays open and close", async () => {
    const runtime = createAffinoVueAdapter()
    const updates: number[] = []
    const unsubscribe = runtime.subscribeToOverlayStack((stack) => {
      updates.push(stack.length)
    })

    const scope = effectScope()
    let dialog!: ReturnType<typeof useDialogController>
    let menu!: ReturnType<typeof useMenuController>
    let popover!: ReturnType<typeof usePopoverController>

    scope.run(() => {
      dialog = useDialogController({ overlayEntryTraits: { priority: 90 } })
      menu = useMenuController({ kind: "root", options: { overlayEntryTraits: { priority: 50 } } })
      popover = usePopoverController({ overlayEntryTraits: { priority: 30 } })
    })

    try {
      dialog.open("programmatic")
      menu.open("programmatic")
      popover.open("programmatic")

      const openedStack = runtime.manager?.getStack() ?? []
      expect(openedStack.length).toBeGreaterThanOrEqual(3)
      expect(openedStack.at(-1)?.kind).toBe("dialog")

      menu.close("programmatic")
      popover.close("programmatic")
      await nextTick()

      const afterTransientClose = runtime.manager?.getStack() ?? []
      expect(afterTransientClose.some((entry) => entry.kind === "menu")).toBe(false)
      expect(afterTransientClose.some((entry) => entry.kind === "popover")).toBe(false)
      expect(afterTransientClose.at(-1)?.kind).toBe("dialog")
    } finally {
      scope.stop()
      unsubscribe()
    }

    expect(updates.some((size) => size >= 1)).toBe(true)
    expect(updates.some((size) => size >= 2)).toBe(true)
    expect(updates.some((size) => size >= 3)).toBe(true)
  })

  it("reuses the same runtime for repeated bootstrap calls by default", () => {
    const a = bootstrapAffinoVueAdapters()
    const b = bootstrapAffinoVueAdapters()
    expect(a).toBe(b)
  })

  it("exposes diagnostics snapshot when diagnostics are enabled", () => {
    const key = "__affinoVueDiagnosticsTest"
    const runtime = bootstrapAffinoVueAdapters({
      bootstrapOnce: false,
      diagnostics: true,
      diagnosticsWindowKey: key,
    })

    const globalScope = window as unknown as Record<string, unknown>
    const exposed = globalScope[key] as { snapshot?: Record<string, unknown> } | undefined

    expect(runtime.diagnostics).not.toBeNull()
    expect(exposed?.snapshot).toBeDefined()
    expect(typeof exposed?.snapshot?.stackSize).toBe("number")
    expect(typeof exposed?.snapshot?.hostStatus).toBe("object")
  })
})
