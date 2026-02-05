import { bootstrapAffinoDialogs } from "@affino/dialog-laravel"
import { bootstrapAffinoTooltips } from "@affino/tooltip-laravel"
import { bootstrapAffinoPopovers } from "@affino/popover-laravel"
import { bootstrapAffinoListboxes } from "@affino/listbox-laravel"
import { bootstrapAffinoComboboxes } from "@affino/combobox-laravel"
import { bootstrapAffinoMenus } from "@affino/menu-laravel"

type ManualAction = "open" | "close" | "toggle" | "select" | "clear"

type ManualBridgeDetail = {
  id?: string
  action?: ManualAction
  reason?: string
  options?: unknown
  index?: number
  value?: string
  toggle?: boolean
  extend?: boolean
}

type BootstrapOptions = {
  registerScrollGuards?: boolean
}

type BridgeConfig = {
  eventName: string
  rootAttribute: string
  property: string
  rehydrate?: () => void
  supportsOptions?: boolean
  handledFlag?: string
}

const MAX_MANUAL_RETRIES = 20
const DEFAULT_HANDLED_FLAG = "__affinoManualHandled"

export function bootstrapAffinoLaravelAdapters(options: BootstrapOptions = {}): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return
  }

  const win = window as unknown as Record<string, unknown>
  const flag = "__affinoLaravelAdapterBootstrapped"
  if (win[flag]) {
    return
  }
  win[flag] = true

  bootstrapAffinoDialogs()
  bootstrapAffinoTooltips()
  bootstrapAffinoPopovers()
  bootstrapAffinoListboxes()
  bootstrapAffinoComboboxes()
  bootstrapAffinoMenus()

  registerManualControllerBridge({
    eventName: "affino-dialog:manual",
    rootAttribute: "data-affino-dialog-root",
    property: "affinoDialog",
    rehydrate: bootstrapAffinoDialogs,
    supportsOptions: true,
  })
  registerManualControllerBridge({
    eventName: "affino-tooltip:manual",
    rootAttribute: "data-affino-tooltip-root",
    property: "affinoTooltip",
    rehydrate: bootstrapAffinoTooltips,
  })
  registerManualControllerBridge({
    eventName: "affino-popover:manual",
    rootAttribute: "data-affino-popover-root",
    property: "affinoPopover",
    rehydrate: bootstrapAffinoPopovers,
  })
  registerManualControllerBridge({
    eventName: "affino-menu:manual",
    rootAttribute: "data-affino-menu-root",
    property: "affinoMenu",
    rehydrate: bootstrapAffinoMenus,
  })
  registerListboxManualBridge({
    eventName: "affino-listbox:manual",
    rootAttribute: "data-affino-listbox-root",
    property: "affinoListbox",
    rehydrate: bootstrapAffinoListboxes,
  })
  registerComboboxManualBridge({
    eventName: "affino-combobox:manual",
    rootAttribute: "data-affino-combobox-root",
    property: "affinoCombobox",
    rehydrate: bootstrapAffinoComboboxes,
  })

  if (options.registerScrollGuards !== false) {
    registerScrollGuards()
  }
}

function registerManualControllerBridge({
  eventName,
  rootAttribute,
  property,
  rehydrate,
  supportsOptions = false,
  handledFlag = DEFAULT_HANDLED_FLAG,
}: BridgeConfig): void {
  const findHandle = (id: string) => {
    const root = findRootById(rootAttribute, id)
    return root?.[property]
  }

  const invokeAction = (detail: ManualBridgeDetail, attempt = 0): void => {
    const handle = findHandle(detail.id ?? "")
    if (!handle) {
      if (attempt < MAX_MANUAL_RETRIES) {
        requestAnimationFrame(() => invokeAction(detail, attempt + 1))
      }
      return
    }

    const reason = detail.reason ?? "programmatic"

    if (detail.action === "open") {
      handle.open(reason)
      return
    }

    if (detail.action === "close") {
      if (supportsOptions && Object.prototype.hasOwnProperty.call(detail, "options")) {
        handle.close(reason, detail.options)
        return
      }
      handle.close(reason)
      return
    }

    handle.toggle()
  }

  const handler = (rawEvent: Event) => {
    const event = rawEvent as Event & Record<string, unknown>
    if (event[handledFlag]) {
      return
    }
    event[handledFlag] = true

    const detail = (rawEvent as CustomEvent<ManualBridgeDetail>).detail
    if (!detail || !detail.id || !detail.action) {
      return
    }

    rehydrate?.()
    invokeAction(detail)
  }

  document.addEventListener(eventName, handler)
}

function registerListboxManualBridge(config: BridgeConfig): void {
  registerSelectionBridge(config, (handle, detail) => {
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
          handle.selectIndex(detail.index, { toggle: detail.toggle, extend: detail.extend })
          return
        }
        if (typeof detail.value === "string") {
          handle.selectValue(detail.value)
        }
    }
  })
}

function registerComboboxManualBridge(config: BridgeConfig): void {
  registerSelectionBridge(
    {
      ...config,
      handledFlag: "__affinoComboboxManualHandled",
    },
    (handle, detail) => {
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
            handle.selectIndex(detail.index, { toggle: detail.toggle, extend: detail.extend })
            return
          }
          if (typeof detail.value === "string") {
            handle.selectValue(detail.value)
          }
          return
        case "clear":
          handle.clear()
          return
      }
    },
  )
}

function registerSelectionBridge(
  {
    eventName,
    rootAttribute,
    property,
    rehydrate,
    handledFlag = DEFAULT_HANDLED_FLAG,
  }: BridgeConfig,
  applyAction: (handle: any, detail: ManualBridgeDetail) => void,
): void {
  const findHandle = (id: string) => {
    const root = findRootById(rootAttribute, id)
    return root?.[property]
  }

  const invoke = (detail: ManualBridgeDetail, attempt = 0): void => {
    const handle = findHandle(detail.id ?? "")
    if (!handle) {
      if (attempt < MAX_MANUAL_RETRIES) {
        requestAnimationFrame(() => invoke(detail, attempt + 1))
      }
      return
    }

    applyAction(handle, detail)
  }

  const handler = (rawEvent: Event) => {
    const event = rawEvent as Event & Record<string, unknown>
    if (event[handledFlag]) {
      return
    }
    event[handledFlag] = true

    const detail = (rawEvent as CustomEvent<ManualBridgeDetail>).detail
    if (!detail || !detail.id || !detail.action) {
      return
    }

    rehydrate?.()
    invoke(detail)
  }

  document.addEventListener(eventName, handler)
}

function registerScrollGuards(): void {
  const win = window as unknown as Record<string, unknown>
  const flag = "__affinoScrollGuardsRegistered"
  if (win[flag]) {
    return
  }
  win[flag] = true

  let ticking = false

  const closeAll = () => {
    ticking = false
    closeOpenTooltips()
    closeOpenPopovers()
    closeOpenComboboxes()
    closeOpenMenus()
  }

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) {
        return
      }
      ticking = true
      requestAnimationFrame(closeAll)
    },
    { passive: true },
  )
}

function closeOpenTooltips(): void {
  const openTooltips = document.querySelectorAll<HTMLElement>("[data-affino-tooltip-state='open']")
  openTooltips.forEach((root) => {
    if (root.dataset.affinoTooltipTriggerMode === "manual") {
      return
    }
    const handle = (root as HTMLElement & Record<string, any>).affinoTooltip
    handle?.close("programmatic")
  })
}

function closeOpenPopovers(): void {
  const openPopovers = document.querySelectorAll<HTMLElement>("[data-affino-popover-state='open']")
  openPopovers.forEach((root) => {
    const isPinned = root.dataset.affinoPopoverPinned === "true"
    const isModal = root.dataset.affinoPopoverModal === "true"
    if (isPinned || isModal) {
      return
    }
    const handle = (root as HTMLElement & Record<string, any>).affinoPopover
    handle?.close("programmatic")
  })
}

function closeOpenComboboxes(): void {
  const openComboboxes = document.querySelectorAll<HTMLElement>("[data-affino-combobox-state='true']")
  openComboboxes.forEach((root) => {
    if (root.dataset.affinoComboboxPinned === "true") {
      return
    }
    const handle = (root as HTMLElement & Record<string, any>).affinoCombobox
    handle?.close()
  })
}

function closeOpenMenus(): void {
  const openMenus = document.querySelectorAll<HTMLElement>("[data-affino-menu-state='open']")
  openMenus.forEach((root) => {
    if (root.dataset.affinoMenuPinned === "true") {
      return
    }
    const handle = (root as HTMLElement & Record<string, any>).affinoMenu
    handle?.close("programmatic")
  })
}

function findRootById(rootAttribute: string, id: string): (HTMLElement & Record<string, any>) | null {
  const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id
  const selector = `[${rootAttribute}="${escapedId}"]`
  return document.querySelector<HTMLElement>(selector) as (HTMLElement & Record<string, any>) | null
}
