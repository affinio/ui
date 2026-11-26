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
      dataTransfer: { effectAllowed: "", setData: () => undefined },
    })
    await wrapper.findAll(".ui-workspace-tabs__item")[0]!.trigger("drop", { clientX: -1 })
    expect(wrapper.emitted("reorder")).toBeUndefined()
    wrapper.unmount()
  })
})
