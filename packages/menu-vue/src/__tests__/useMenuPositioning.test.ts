import { createApp, defineComponent, h, nextTick, onMounted } from "vue"
import { describe, expect, it, vi } from "vitest"
import { useMenuController } from "../useMenuController"
import { useMenuPositioning } from "../useMenuPositioning"

describe("useMenuPositioning", () => {
  it("binds relayout listeners only while menu is open", async () => {
    const addSpy = vi.spyOn(window, "addEventListener")
    const removeSpy = vi.spyOn(window, "removeEventListener")

    const host = document.createElement("div")
    document.body.appendChild(host)

    let controller!: ReturnType<typeof useMenuController>

    const app = createApp(
      defineComponent({
        setup() {
          controller = useMenuController({ kind: "root" })
          useMenuPositioning(controller)
          onMounted(() => {
            controller.open("programmatic")
          })
          return () => h("div")
        },
      }),
    )

    try {
      app.mount(host)
      await nextTick()

      expect(addSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true)
      expect(addSpy).toHaveBeenCalledWith("resize", expect.any(Function))

      controller.close("programmatic")
      await nextTick()

      expect(removeSpy).toHaveBeenCalledWith("scroll", expect.any(Function), true)
      expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function))
    } finally {
      app.unmount()
      host.remove()
      addSpy.mockRestore()
      removeSpy.mockRestore()
    }
  })
})
