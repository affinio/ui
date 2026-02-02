import { describe, expect, it, vi } from "vitest"
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
    })

    binding.open()
    expect(register).toHaveBeenCalledTimes(1)
    const overlay = register.mock.calls[0][0]
    expect(overlay).toMatchObject({ kind: "dialog" })

    await binding.close("backdrop")
    expect(isTopMost).toHaveBeenCalledWith(overlay.id)
    expect(unregister).toHaveBeenCalledTimes(1)
  })
})
