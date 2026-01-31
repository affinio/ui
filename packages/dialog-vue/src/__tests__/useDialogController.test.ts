import { describe, expect, it } from "vitest"
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
})
