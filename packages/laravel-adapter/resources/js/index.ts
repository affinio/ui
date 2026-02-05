import { bootstrapAffinoDialogs } from "@affino/dialog-laravel"
import { bootstrapAffinoTooltips } from "@affino/tooltip-laravel"
import { bootstrapAffinoPopovers } from "@affino/popover-laravel"
import { bootstrapAffinoListboxes } from "@affino/listbox-laravel"
import { bootstrapAffinoComboboxes } from "@affino/combobox-laravel"
import { bootstrapAffinoMenus } from "@affino/menu-laravel"
import { bootstrapAffinoTabs } from "@affino/tabs-laravel"
import { bootstrapAffinoDisclosure } from "@affino/disclosure-laravel"
import {
  AFFINO_COMBOBOX_MANUAL_EVENT,
  AFFINO_DISCLOSURE_MANUAL_EVENT,
  AFFINO_DIALOG_MANUAL_EVENT,
  AFFINO_LISTBOX_MANUAL_EVENT,
  AFFINO_MENU_MANUAL_EVENT,
  AFFINO_POPOVER_MANUAL_EVENT,
  AFFINO_TABS_MANUAL_EVENT,
  AFFINO_TOOLTIP_MANUAL_EVENT,
  type AffinoComboboxManualEventDetail,
  type AffinoDisclosureManualEventDetail,
  type AffinoDialogManualEventDetail,
  type AffinoLaravelAdapterOptions,
  type AffinoListboxManualEventDetail,
  type AffinoMenuManualEventDetail,
  type AffinoPopoverManualEventDetail,
  type AffinoTabsManualEventDetail,
  type AffinoTooltipManualEventDetail,
} from "./contracts"
import { bindManualBridge } from "./internal/manualBridge"
import { registerScrollGuards, type ScrollGuardTarget } from "./internal/scrollGuards"
import { createDiagnosticsRuntime } from "./internal/diagnostics"

export type {
  AffinoLaravelAdapterOptions,
  AffinoDialogManualEventDetail,
  AffinoTooltipManualEventDetail,
  AffinoPopoverManualEventDetail,
  AffinoMenuManualEventDetail,
  AffinoListboxManualEventDetail,
  AffinoComboboxManualEventDetail,
  AffinoTabsManualEventDetail,
  AffinoDisclosureManualEventDetail,
}
export {
  AFFINO_DIALOG_MANUAL_EVENT,
  AFFINO_TOOLTIP_MANUAL_EVENT,
  AFFINO_POPOVER_MANUAL_EVENT,
  AFFINO_MENU_MANUAL_EVENT,
  AFFINO_LISTBOX_MANUAL_EVENT,
  AFFINO_COMBOBOX_MANUAL_EVENT,
  AFFINO_TABS_MANUAL_EVENT,
  AFFINO_DISCLOSURE_MANUAL_EVENT,
}

const COMPONENT_DESCRIPTORS = [
  { name: "dialog", selector: "[data-affino-dialog-root]", handleProperty: "affinoDialog" },
  { name: "tooltip", selector: "[data-affino-tooltip-root]", handleProperty: "affinoTooltip" },
  { name: "popover", selector: "[data-affino-popover-root]", handleProperty: "affinoPopover" },
  { name: "menu", selector: "[data-affino-menu-root]", handleProperty: "affinoMenu" },
  { name: "listbox", selector: "[data-affino-listbox-root]", handleProperty: "affinoListbox" },
  { name: "combobox", selector: "[data-affino-combobox-root]", handleProperty: "affinoCombobox" },
  { name: "tabs", selector: "[data-affino-tabs-root]", handleProperty: "affinoTabs" },
  { name: "disclosure", selector: "[data-affino-disclosure-root]", handleProperty: "affinoDisclosure" },
] as const

const SCROLL_GUARD_TARGETS: ReadonlyArray<ScrollGuardTarget> = [
  {
    selector: "[data-affino-tooltip-state='open']",
    shouldClose: (root) => root.dataset.affinoTooltipTriggerMode !== "manual",
    close: (root) => {
      const handle = (root as HTMLElement & { affinoTooltip?: { close: (reason?: string) => void } }).affinoTooltip
      handle?.close("programmatic")
    },
  },
  {
    selector: "[data-affino-popover-state='open']",
    shouldClose: (root) => root.dataset.affinoPopoverPinned !== "true" && root.dataset.affinoPopoverModal !== "true",
    close: (root) => {
      const handle = (root as HTMLElement & { affinoPopover?: { close: (reason?: string) => void } }).affinoPopover
      handle?.close("programmatic")
    },
  },
  {
    selector: "[data-affino-combobox-state='true']",
    shouldClose: (root) => root.dataset.affinoComboboxPinned !== "true",
    close: (root) => {
      const handle = (root as HTMLElement & { affinoCombobox?: { close: () => void } }).affinoCombobox
      handle?.close()
    },
  },
  {
    selector: "[data-affino-menu-state='open']",
    shouldClose: (root) => root.dataset.affinoMenuPinned !== "true",
    close: (root) => {
      const handle = (root as HTMLElement & { affinoMenu?: { close: (reason?: string) => void } }).affinoMenu
      handle?.close("programmatic")
    },
  },
] as const

type ManualHandle = {
  open: (reason?: string) => void
  close: (reason?: string, options?: unknown) => void
  toggle: (reason?: string) => void
} & Record<string, unknown>

type ListboxManualHandle = {
  open: () => void
  close: () => void
  toggle: () => void
  selectIndex: (index: number, options?: { extend?: boolean; toggle?: boolean }) => void
  selectValue: (value: string) => void
}

type ComboboxManualHandle = ListboxManualHandle & {
  clear: () => void
}

type TabsManualHandle = {
  select: (value: string) => void
  clear: () => void
}

type DisclosureManualHandle = {
  open: (reason?: string) => void
  close: (reason?: string) => void
  toggle: (reason?: string) => void
}

/**
 * Primary bootstrap entry point for all Affino Laravel adapters.
 * This is the ONLY supported public API for initializing the runtime.
 */
export function bootstrapAffinoLaravelAdapters(options: AffinoLaravelAdapterOptions = {}): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return
  }

  const scope = window as unknown as Record<string, unknown>
  const flag = "__affinoLaravelAdapterBootstrapped"
  if (scope[flag]) {
    return
  }
  scope[flag] = true

  const diagnostics = options.diagnostics ? createDiagnosticsRuntime(COMPONENT_DESCRIPTORS) : null
  diagnostics?.expose()

  bootstrapAffinoDialogs()
  bootstrapAffinoTooltips()
  bootstrapAffinoPopovers()
  bootstrapAffinoListboxes()
  bootstrapAffinoComboboxes()
  bootstrapAffinoMenus()
  bootstrapAffinoTabs()
  bootstrapAffinoDisclosure()

  bindManualBridge<typeof AFFINO_DIALOG_MANUAL_EVENT, ManualHandle>({
    component: "dialog",
    eventName: AFFINO_DIALOG_MANUAL_EVENT,
    rootAttribute: "data-affino-dialog-root",
    handleProperty: "affinoDialog",
    rehydrate: bootstrapAffinoDialogs,
    diagnostics,
    invoke: (handle, detail) => {
      if (detail.action === "open") {
        handle.open(detail.reason)
        return
      }
      if (detail.action === "close") {
        handle.close(detail.reason, detail.options)
        return
      }
      handle.toggle(detail.reason)
    },
  })

  bindManualBridge<typeof AFFINO_TOOLTIP_MANUAL_EVENT, ManualHandle>({
    component: "tooltip",
    eventName: AFFINO_TOOLTIP_MANUAL_EVENT,
    rootAttribute: "data-affino-tooltip-root",
    handleProperty: "affinoTooltip",
    rehydrate: bootstrapAffinoTooltips,
    diagnostics,
    invoke: (handle, detail) => {
      if (detail.action === "open") {
        handle.open(detail.reason)
        return
      }
      if (detail.action === "close") {
        handle.close(detail.reason)
        return
      }
      handle.toggle(detail.reason)
    },
  })

  bindManualBridge<typeof AFFINO_POPOVER_MANUAL_EVENT, ManualHandle>({
    component: "popover",
    eventName: AFFINO_POPOVER_MANUAL_EVENT,
    rootAttribute: "data-affino-popover-root",
    handleProperty: "affinoPopover",
    rehydrate: bootstrapAffinoPopovers,
    diagnostics,
    invoke: (handle, detail) => {
      if (detail.action === "open") {
        handle.open(detail.reason)
        return
      }
      if (detail.action === "close") {
        handle.close(detail.reason)
        return
      }
      handle.toggle(detail.reason)
    },
  })

  bindManualBridge<typeof AFFINO_MENU_MANUAL_EVENT, ManualHandle>({
    component: "menu",
    eventName: AFFINO_MENU_MANUAL_EVENT,
    rootAttribute: "data-affino-menu-root",
    handleProperty: "affinoMenu",
    rehydrate: bootstrapAffinoMenus,
    diagnostics,
    invoke: (handle, detail) => {
      if (detail.action === "open") {
        handle.open(detail.reason)
        return
      }
      if (detail.action === "close") {
        handle.close(detail.reason)
        return
      }
      handle.toggle(detail.reason)
    },
  })

  bindManualBridge<typeof AFFINO_LISTBOX_MANUAL_EVENT, ListboxManualHandle>({
    component: "listbox",
    eventName: AFFINO_LISTBOX_MANUAL_EVENT,
    rootAttribute: "data-affino-listbox-root",
    handleProperty: "affinoListbox",
    rehydrate: bootstrapAffinoListboxes,
    diagnostics,
    invoke: (handle, detail) => {
      switch (detail.action) {
        case "open":
          handle.open()
          return
        case "close":
          handle.close()
          return
        case "toggle":
          handle.toggle()
          return
        case "select":
          if (typeof detail.index === "number") {
            handle.selectIndex(detail.index, { extend: detail.extend, toggle: detail.toggle })
            return
          }
          if (typeof detail.value === "string") {
            handle.selectValue(detail.value)
          }
      }
    },
  })

  bindManualBridge<typeof AFFINO_COMBOBOX_MANUAL_EVENT, ComboboxManualHandle>({
    component: "combobox",
    eventName: AFFINO_COMBOBOX_MANUAL_EVENT,
    rootAttribute: "data-affino-combobox-root",
    handleProperty: "affinoCombobox",
    rehydrate: bootstrapAffinoComboboxes,
    diagnostics,
    invoke: (handle, detail) => {
      switch (detail.action) {
        case "open":
          handle.open()
          return
        case "close":
          handle.close()
          return
        case "toggle":
          handle.toggle()
          return
        case "select":
          if (typeof detail.index === "number") {
            handle.selectIndex(detail.index, { extend: detail.extend, toggle: detail.toggle })
            return
          }
          if (typeof detail.value === "string") {
            handle.selectValue(detail.value)
            return
          }
          return
        case "clear":
          handle.clear()
          return
      }
    },
  })

  bindManualBridge<typeof AFFINO_TABS_MANUAL_EVENT, TabsManualHandle>({
    component: "tabs",
    eventName: AFFINO_TABS_MANUAL_EVENT,
    rootAttribute: "data-affino-tabs-root",
    handleProperty: "affinoTabs",
    rehydrate: bootstrapAffinoTabs,
    diagnostics,
    invoke: (handle, detail) => {
      if (detail.action === "clear") {
        handle.clear()
        return
      }
      if (detail.action === "select" && typeof detail.value === "string" && detail.value.length > 0) {
        handle.select(detail.value)
      }
    },
  })

  bindManualBridge<typeof AFFINO_DISCLOSURE_MANUAL_EVENT, DisclosureManualHandle>({
    component: "disclosure",
    eventName: AFFINO_DISCLOSURE_MANUAL_EVENT,
    rootAttribute: "data-affino-disclosure-root",
    handleProperty: "affinoDisclosure",
    rehydrate: bootstrapAffinoDisclosure,
    diagnostics,
    invoke: (handle, detail) => {
      if (detail.action === "open") {
        handle.open(detail.reason)
        return
      }
      if (detail.action === "close") {
        handle.close(detail.reason)
        return
      }
      handle.toggle(detail.reason)
    },
  })

  if (options.registerScrollGuards !== false) {
    registerScrollGuards(SCROLL_GUARD_TARGETS)
  }
}
