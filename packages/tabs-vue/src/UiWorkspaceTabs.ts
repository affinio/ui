import { defineComponent, h, nextTick } from "vue"
import type { PropType } from "vue"

export interface WorkspaceTab {
  id: string
  label: string
  to: string
  closable?: boolean
}

export type WorkspaceTabActivationSource = "pointer" | "keyboard"

export interface WorkspaceTabLinkSlotProps {
  tab: WorkspaceTab
  active: boolean
  attrs: Record<string, unknown>
}

export const UiWorkspaceTabs = defineComponent({
  name: "UiWorkspaceTabs",
  props: {
    tabs: {
      type: Array as PropType<readonly WorkspaceTab[]>,
      required: true,
    },
    activeId: {
      type: String as PropType<string | null>,
      default: null,
    },
    ariaLabel: {
      type: String,
      default: "Workspace tabs",
    },
    panelId: {
      type: String,
      default: "workspace-tab-panel",
    },
    reorderable: {
      type: Boolean,
      default: false,
    },
  },
  emits: {
    activate: (_tab: WorkspaceTab, _source: WorkspaceTabActivationSource) => true,
    close: (_tab: WorkspaceTab) => true,
    reorder: (_detail: { tabId: string; fromIndex: number; toIndex: number }) => true,
  },
  setup(props, { emit, slots }) {
    const tabElements = new Map<string, HTMLElement>()
    let draggedTabId: string | null = null

    function bindTabElement(id: string, element: unknown): void {
      if (typeof HTMLElement === "undefined") return
      if (element instanceof HTMLElement) tabElements.set(id, element)
      else tabElements.delete(id)
    }

    function focusTab(tab: WorkspaceTab, source: WorkspaceTabActivationSource): void {
      emit("activate", tab, source)
      void nextTick(() => tabElements.get(tab.id)?.focus({ preventScroll: true }))
    }

    function closeTab(tab: WorkspaceTab, event: MouseEvent | KeyboardEvent): void {
      event.preventDefault()
      event.stopPropagation()
      if (!tab.closable) return
      const index = props.tabs.findIndex((item) => item.id === tab.id)
      const neighbor = props.tabs[index + 1] ?? props.tabs[index - 1]
      emit("close", tab)
      if (neighbor) void nextTick(() => tabElements.get(neighbor.id)?.focus({ preventScroll: true }))
    }

    function onTabKeydown(tab: WorkspaceTab, event: KeyboardEvent): void {
      const enabledTabs = props.tabs
      const index = enabledTabs.findIndex((item) => item.id === tab.id)
      if (index < 0 || !enabledTabs.length) return

      let nextIndex: number | null = null
      if (event.key === "ArrowRight") nextIndex = (index + 1) % enabledTabs.length
      else if (event.key === "ArrowLeft") nextIndex = (index - 1 + enabledTabs.length) % enabledTabs.length
      else if (event.key === "Home") nextIndex = 0
      else if (event.key === "End") nextIndex = enabledTabs.length - 1
      else if ((event.key === "Delete" || event.key === "Backspace") && tab.closable) {
        closeTab(tab, event)
        return
      }

      if (nextIndex === null) return
      event.preventDefault()
      const next = enabledTabs[nextIndex]
      if (next) focusTab(next, "keyboard")
    }

    function onDragStart(tab: WorkspaceTab, event: DragEvent): void {
      if (!props.reorderable || !event.dataTransfer) {
        event.preventDefault()
        return
      }
      draggedTabId = tab.id
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", tab.id)
    }

    function onDrop(targetTab: WorkspaceTab, event: DragEvent): void {
      event.preventDefault()
      const tabId = draggedTabId
      draggedTabId = null
      if (!props.reorderable || !tabId || tabId === targetTab.id) return
      const fromIndex = props.tabs.findIndex((tab) => tab.id === tabId)
      const targetIndex = props.tabs.findIndex((tab) => tab.id === targetTab.id)
      if (fromIndex < 0 || targetIndex < 0) return

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      const insertAfter = event.clientX >= rect.left + rect.width / 2
      const insertionIndex = targetIndex + (insertAfter ? 1 : 0)
      const toIndex = insertionIndex > fromIndex ? insertionIndex - 1 : insertionIndex
      if (fromIndex !== toIndex) emit("reorder", { tabId, fromIndex, toIndex })
    }

    return () => h(
      "div",
      {
        class: "ui-workspace-tabs",
        role: "tablist",
        "aria-label": props.ariaLabel,
      },
      props.tabs.map((tab) => {
        const active = tab.id === props.activeId
        const attrs: Record<string, unknown> = {
          id: `workspace-tab-${encodeURIComponent(tab.id)}`,
          href: tab.to,
          role: "tab",
          tabindex: active ? 0 : -1,
          "aria-selected": active,
          "aria-controls": props.panelId,
          "data-state": active ? "active" : "inactive",
          class: "ui-workspace-tabs__link",
          ref: (element: unknown) => bindTabElement(tab.id, element),
          onClick: () => emit("activate", tab, "pointer"),
          onKeydown: (event: KeyboardEvent) => onTabKeydown(tab, event),
        }
        const link = slots["tab-link"]?.({ tab, active, attrs }) ?? h("a", attrs, tab.label)
        const children = [link]
        if (tab.closable) {
          children.push(h("button", {
            key: `close-${tab.id}`,
            class: "ui-workspace-tabs__close",
            type: "button",
            "aria-label": `Close ${tab.label}`,
            title: `Close ${tab.label}`,
            onClick: (event: MouseEvent) => closeTab(tab, event),
            draggable: false,
            onDragStart: (event: DragEvent) => event.stopPropagation(),
          }, "×"))
        }
        return h("div", {
          key: tab.id,
          class: ["ui-workspace-tabs__item", { "is-active": active }],
          role: "presentation",
          draggable: props.reorderable,
          onDragstart: (event: DragEvent) => onDragStart(tab, event),
          onDragend: () => { draggedTabId = null },
          onDragover: (event: DragEvent) => {
            if (props.reorderable && draggedTabId) event.preventDefault()
          },
          onDrop: (event: DragEvent) => onDrop(tab, event),
        }, children)
      }),
    )
  },
})

export default UiWorkspaceTabs
