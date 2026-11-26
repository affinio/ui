// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { h, nextTick } from "vue"
import { mount } from "@vue/test-utils"
import { UiWorkspaceTabs, type WorkspaceTab } from "../UiWorkspaceTabs"

const tabs: WorkspaceTab[] = [
  { id: "settings", label: "Settings", to: "/workspace/settings", closable: true },
  { id: "doc-a", label: "Document A", to: "/workspace/documents/a", closable: true },
  { id: "doc-b", label: "Document B", to: "/workspace/documents/b", closable: true },
]

describe("UiWorkspaceTabs", () => {
  it("renders an accessible tablist with active state and closable controls", () => {
    const wrapper = mount(UiWorkspaceTabs, {
      props: { tabs, activeId: "doc-a" },
      attachTo: document.body,
    })

    expect(wrapper.get('[role="tablist"]').attributes("aria-label")).toBe("Workspace tabs")
    const renderedTabs = wrapper.findAll('[role="tab"]')
    expect(renderedTabs).toHaveLength(3)
    expect(renderedTabs[1]?.attributes("aria-selected")).toBe("true")
    expect(renderedTabs[1]?.attributes("tabindex")).toBe("0")
    expect(renderedTabs[0]?.attributes("tabindex")).toBe("-1")
    expect(renderedTabs[1]?.attributes("aria-controls")).toBe("workspace-tab-panel")
    expect(wrapper.findAll(".ui-workspace-tabs__close")).toHaveLength(3)
    expect(wrapper.get('[aria-label="Close Document A"]').element.tagName).toBe("BUTTON")
    wrapper.unmount()
  })

  it("emits activation and navigates focus with arrow and Home/End keys", async () => {
    const wrapper = mount(UiWorkspaceTabs, {
      props: { tabs, activeId: "settings" },
      attachTo: document.body,
      slots: {
        "tab-link": ({ tab, attrs }) => h("a", {
          ...attrs,
          onClick: (event: MouseEvent) => {
            event.preventDefault()
            ;(attrs.onClick as (event: MouseEvent) => void)(event)
          },
        }, tab.label),
      },
    })
    const renderedTabs = wrapper.findAll('[role="tab"]')

    await renderedTabs[0]!.trigger("keydown", { key: "ArrowRight" })
    expect(wrapper.emitted("activate")?.[0]).toEqual([tabs[1], "keyboard"])
    expect(document.activeElement).toBe(renderedTabs[1]!.element)

    await renderedTabs[1]!.trigger("keydown", { key: "End" })
    expect(wrapper.emitted("activate")?.[1]).toEqual([tabs[2], "keyboard"])
    expect(document.activeElement).toBe(renderedTabs[2]!.element)
    wrapper.unmount()
  })

  it("emits pointer activation and closes tabs through their labeled controls", async () => {
    const wrapper = mount(UiWorkspaceTabs, {
      props: { tabs, activeId: "settings" },
      attachTo: document.body,
      slots: {
        "tab-link": ({ tab, attrs }) => h("a", {
          ...attrs,
          onClick: (event: MouseEvent) => {
            event.preventDefault()
            ;(attrs.onClick as (event: MouseEvent) => void)(event)
          },
        }, tab.label),
      },
    })

    await wrapper.get('[role="tab"][href="/workspace/documents/a"]').trigger("click")
    expect(wrapper.emitted("activate")?.[0]).toEqual([tabs[1], "pointer"])
    await wrapper.get('[aria-label="Close Document A"]').trigger("click")
    expect(wrapper.emitted("close")?.[0]).toEqual([tabs[1]])
    expect(wrapper.find('[aria-label="Close Settings"]').exists()).toBe(true)
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('[href="/workspace/documents/b"]').element)
    wrapper.unmount()
  })

  it("emits controlled reorder details only when reorder is enabled", async () => {
    const wrapper = mount(UiWorkspaceTabs, {
      props: { tabs, activeId: "settings", reorderable: true },
    })
    const items = wrapper.findAll(".ui-workspace-tabs__item")
    const dataTransfer = {
      effectAllowed: "",
      clearData: () => undefined,
      setData: () => undefined,
    }

    await items[2]!.trigger("dragstart", { dataTransfer })
    await items[0]!.trigger("drop", { clientX: -1 })
    expect(wrapper.emitted("reorder")?.[0]).toEqual([{ tabId: "doc-b", fromIndex: 2, toIndex: 0 }])
    wrapper.unmount()
  })

  it("disables dragging by default and ignores cancelled drags", async () => {
    const wrapper = mount(UiWorkspaceTabs, { props: { tabs, activeId: "settings" } })
    expect(wrapper.findAll(".ui-workspace-tabs__item")[2]!.attributes("draggable")).toBe("false")
    await wrapper.findAll(".ui-workspace-tabs__item")[2]!.trigger("dragstart", {
      dataTransfer: { effectAllowed: "", clearData: () => undefined, setData: () => undefined },
    })
    await wrapper.findAll(".ui-workspace-tabs__item")[0]!.trigger("drop", { clientX: -1 })
    expect(wrapper.emitted("reorder")).toBeUndefined()
    wrapper.unmount()
  })

  it("shows a drop position and moves a tab dropped in the center of its neighbor", async () => {
    const wrapper = mount(UiWorkspaceTabs, {
      props: { tabs, activeId: "settings", reorderable: true },
    })
    const items = wrapper.findAll(".ui-workspace-tabs__item")
    Object.defineProperty(items[1]!.element, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100 }),
    })
    const dataTransfer = { effectAllowed: "", clearData: () => undefined, setData: () => undefined }

    await items[0]!.trigger("dragstart", { dataTransfer })
    await items[1]!.trigger("dragover", { clientX: 50 })
    expect(items[1]!.classes()).toContain("is-drop-after")
    const indicatorStyle = items[1]!.find(".ui-workspace-tabs__drop-indicator").attributes("style")
    expect(indicatorStyle).toContain("right: 0px")
    expect(indicatorStyle).toContain("width: var(--affino-tabs-drop-indicator-width, 3px)")
    expect(indicatorStyle).toContain("background-color: var(--affino-tabs-drop-indicator-color, currentColor)")
    expect(indicatorStyle).toContain("--affino-tabs-drop-indicator-shadow")
    await items[1]!.trigger("drop", { clientX: 50 })
    expect(wrapper.emitted("reorder")?.[0]).toEqual([{ tabId: "settings", fromIndex: 0, toIndex: 1 }])
    wrapper.unmount()
  })

  it("uses the left and right edges as explicit insertion positions", async () => {
    const wrapper = mount(UiWorkspaceTabs, {
      props: { tabs, activeId: "settings", reorderable: true },
    })
    const items = wrapper.findAll(".ui-workspace-tabs__item")
    Object.defineProperty(items[1]!.element, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100 }),
    })
    const dataTransfer = { effectAllowed: "", clearData: () => undefined, setData: () => undefined }

    await items[0]!.trigger("dragstart", { dataTransfer })
    await items[1]!.trigger("dragover", { clientX: 5 })
    expect(items[1]!.classes()).toContain("is-drop-before")
    expect(items[1]!.find(".ui-workspace-tabs__drop-indicator").attributes("style")).toContain("left: 0px")
    await items[1]!.trigger("drop", { clientX: 5 })
    expect(wrapper.emitted("reorder")).toBeUndefined()

    await items[0]!.trigger("dragstart", { dataTransfer })
    await items[1]!.trigger("dragover", { clientX: 95 })
    expect(items[1]!.classes()).toContain("is-drop-after")
    await items[1]!.trigger("drop", { clientX: 95 })
    expect(wrapper.emitted("reorder")?.[0]).toEqual([{ tabId: "settings", fromIndex: 0, toIndex: 1 }])
    wrapper.unmount()
  })

  it("reorders from custom link and icon content without dragging the URL", async () => {
    const pair = tabs.slice(0, 2)
    const formats = new Map<string, string>([["text/uri-list", "/workspace/settings"]])
    let clearedNativePayload = false
    const dataTransfer = {
      effectAllowed: "",
      clearData: () => {
        clearedNativePayload = true
        formats.clear()
      },
      setData: (format: string, value: string) => formats.set(format, value),
    }
    const wrapper = mount(UiWorkspaceTabs, {
      props: { tabs: pair, activeId: "settings", reorderable: true },
      slots: {
        "tab-link": ({ tab }) => h("a", { href: tab.to }, [h("img", { src: "/icon.svg", alt: "" }), tab.label]),
      },
    })
    const link = wrapper.get('a[href="/workspace/settings"]')
    const items = wrapper.findAll(".ui-workspace-tabs__item")

    expect(link.attributes("draggable")).toBe("false")
    expect(link.get("img").attributes("draggable")).toBe("false")
    await link.trigger("dragstart", { dataTransfer })
    expect(clearedNativePayload).toBe(true)
    expect([...formats.entries()]).toEqual([["text/plain", "settings"]])
    await items[1]!.trigger("drop", { clientX: -1 })
    expect(wrapper.emitted("reorder")?.[0]).toEqual([{ tabId: "settings", fromIndex: 0, toIndex: 1 }])
    wrapper.unmount()
  })
})
