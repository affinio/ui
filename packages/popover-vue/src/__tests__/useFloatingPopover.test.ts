import { createApp, defineComponent, h, nextTick } from "vue"
import { describe, expect, it } from "vitest"
import { usePopoverController } from "../usePopoverController"
import { useFloatingPopover } from "../useFloatingPopover"

type MountedFloatingPopover = {
  controller: ReturnType<typeof usePopoverController>
  floating: ReturnType<typeof useFloatingPopover>
  cleanup: () => void
}

function mountFloatingPopover(options?: Parameters<typeof useFloatingPopover>[1]): MountedFloatingPopover {
  const host = document.createElement("div")
  document.body.appendChild(host)

  let controller!: ReturnType<typeof usePopoverController>
  let floating!: ReturnType<typeof useFloatingPopover>

  const app = createApp(
    defineComponent({
      setup() {
        controller = usePopoverController({ id: `floating-popover-${Math.random().toString(36).slice(2)}` })
        floating = useFloatingPopover(controller, options)
        return () => h("div")
      },
    }),
  )

  app.mount(host)

  return {
    controller,
    floating,
    cleanup: () => {
      app.unmount()
      host.remove()
    },
  }
}

describe("useFloatingPopover", () => {
  it("ignores pointer outside events that target sticky zones for the same popover", async () => {
    const { controller, floating, cleanup } = mountFloatingPopover({ closeOnInteractOutside: true, returnFocus: false })

    const trigger = document.createElement("button")
    const content = document.createElement("div")
    document.body.appendChild(trigger)
    document.body.appendChild(content)
    floating.triggerRef.value = trigger
    floating.contentRef.value = content

    const sticky = document.createElement("div")
    sticky.setAttribute("data-affino-popover-sticky", controller.id)
    const stickyChild = document.createElement("button")
    sticky.appendChild(stickyChild)
    document.body.appendChild(sticky)

    const outside = document.createElement("button")
    document.body.appendChild(outside)

    try {
      controller.open("programmatic")
      await nextTick()

      stickyChild.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
      expect(controller.state.value.open).toBe(true)

      outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
      expect(controller.state.value.open).toBe(false)
    } finally {
      sticky.remove()
      outside.remove()
      trigger.remove()
      content.remove()
      cleanup()
    }
  })

  it("returns focus to trigger when returnFocus is enabled", async () => {
    const { controller, floating, cleanup } = mountFloatingPopover({ returnFocus: true, closeOnInteractOutside: true })

    const trigger = document.createElement("button")
    const content = document.createElement("div")
    const other = document.createElement("input")
    document.body.appendChild(trigger)
    document.body.appendChild(content)
    document.body.appendChild(other)
    floating.triggerRef.value = trigger
    floating.contentRef.value = content

    try {
      controller.open("programmatic")
      await nextTick()
      other.focus()
      expect(document.activeElement).toBe(other)

      controller.close("programmatic")
      await nextTick()
      await nextTick()

      expect(document.activeElement).toBe(trigger)
    } finally {
      other.remove()
      trigger.remove()
      content.remove()
      cleanup()
    }
  })

  it("uses kernel-based scroll lock and restores previous overflow style", async () => {
    const { controller, floating, cleanup } = mountFloatingPopover({ lockScroll: true, returnFocus: false })

    const trigger = document.createElement("button")
    const content = document.createElement("div")
    document.body.appendChild(trigger)
    document.body.appendChild(content)
    floating.triggerRef.value = trigger
    floating.contentRef.value = content

    const html = document.documentElement
    const previousOverflow = html.style.overflow
    html.style.overflow = "clip"

    try {
      controller.open("programmatic")
      await nextTick()
      expect(html.style.overflow).toBe("hidden")

      controller.close("programmatic")
      await nextTick()
      expect(html.style.overflow).toBe("clip")
    } finally {
      html.style.overflow = previousOverflow
      trigger.remove()
      content.remove()
      cleanup()
    }
  })
})
