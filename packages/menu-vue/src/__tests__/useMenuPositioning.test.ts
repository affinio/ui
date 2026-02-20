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

  it("forwards placement/align/gutter/viewportPadding to computePosition", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)

    let computePositionSpy: ReturnType<typeof vi.spyOn> | null = null

    const app = createApp(
      defineComponent({
        setup() {
          const controller = useMenuController({ kind: "root" })

          computePositionSpy = vi.spyOn(controller.core, "computePosition")
          const update = useMenuPositioning(controller, {
            placement: "left",
            align: "end",
            gutter: 14,
            viewportPadding: 20,
          })

          onMounted(() => {
            const trigger = document.createElement("button")
            const panel = document.createElement("div")
            trigger.getBoundingClientRect = () =>
              ({ x: 700, y: 120, width: 100, height: 40, top: 120, left: 700, right: 800, bottom: 160 } as DOMRect)
            panel.getBoundingClientRect = () =>
              ({ x: 0, y: 0, width: 180, height: 220, top: 0, left: 0, right: 180, bottom: 220 } as DOMRect)

            controller.triggerRef.value = trigger
            controller.panelRef.value = panel
            controller.open("programmatic")
            update()
          })

          return () => h("div")
        },
      }),
    )

    try {
      app.mount(host)
      await nextTick()

      expect(computePositionSpy).not.toBeNull()
      expect(computePositionSpy).toHaveBeenCalled()
      const callOptions = computePositionSpy?.mock.calls[0]?.[2]
      expect(callOptions).toMatchObject({
        placement: "left",
        align: "end",
        gutter: 14,
        viewportPadding: 20,
      })
    } finally {
      app.unmount()
      host.remove()
      computePositionSpy?.mockRestore()
    }
  })
})
