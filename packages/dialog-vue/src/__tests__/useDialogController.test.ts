import { describe, expect, it, vi } from "vitest"
import { getDocumentOverlayManager } from "@affino/overlay-kernel"
import { useDialogController } from "../useDialogController.js"

function nextTick(): Promise<void> {
  return Promise.resolve()
}

describe("useDialogController", () => {
  it("keeps the snapshot ref in sync with controller transitions", async () => {
    const binding = useDialogController()

    expect(binding.snapshot.value.isOpen).toBe(false)
    expect(binding.snapshot.value.phase).toBe("idle")

    binding.open()
    expect(binding.snapshot.value.phase).toBe("open")

    await binding.close()
    await nextTick()
    expect(binding.snapshot.value.phase).toBe("closed")
    expect(binding.snapshot.value.isOpen).toBe(false)
  })

  it("stops updating once disposed", () => {
    const binding = useDialogController()
    binding.dispose()

    binding.open()
    expect(binding.snapshot.value.phase).toBe("idle")
  })

  it("relays overlay registrations when a registrar is provided", async () => {
    const unregister = vi.fn()
    const register = vi.fn().mockReturnValue(unregister)
    const isTopMost = vi.fn().mockReturnValue(true)

    const binding = useDialogController({
      overlayRegistrar: {
        register,
        isTopMost,
      },
      getOverlayManager: () => null,
    })

    binding.open()
    expect(register).toHaveBeenCalledTimes(1)
    const overlay = register.mock.calls[0][0]
    expect(overlay).toMatchObject({ kind: "dialog" })

    await binding.close("backdrop")
    expect(isTopMost).toHaveBeenCalledWith(overlay.id)
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it("registers overlays with the document manager by default", async () => {
    const manager = getDocumentOverlayManager(document)
    const binding = useDialogController()
    let overlayId: string | null = null
    const unsubscribe = binding.controller.on("overlay-registered", ({ id }) => {
      overlayId = id
    })

    binding.open()
    expect(overlayId).toBeTruthy()
    expect(manager.getStack().some((entry) => entry.id === overlayId)).toBe(true)

    await binding.close("backdrop")
    await nextTick()
    expect(manager.getStack().some((entry) => entry.id === overlayId)).toBe(false)

    unsubscribe()
    binding.dispose()
  })
})
