/**
 * Public bootstrap contract for the Affino Laravel adapter runtime.
 *
 * Individual component-level bootstrap functions (for dialogs, menus, etc.)
 * remain internal implementation details and MUST NOT be imported directly.
 * Always call {@link bootstrapAffinoLaravelAdapters} and dispatch manual events
 * that conform to the types declared in this module.
 */
import type {
  CloseRequestOptions,
  DialogCloseReason,
  DialogOpenReason,
} from "@affino/dialog-core"
import type { TooltipReason } from "@affino/tooltip-core"
import type { SurfaceReason as PopoverReason } from "@affino/popover-core"
import type { SurfaceReason as MenuReason } from "@affino/surface-core"

export type AffinoLaravelAdapterOptions = {
  /**
   * When true (default), the adapter closes transient overlays during window scroll.
   * Disable if the hosting application needs to manage scroll guards itself.
   */
  registerScrollGuards?: boolean
  /**
   * Enables developer-only diagnostics. In production builds this flag should remain false.
   * Diagnostics expose read-only snapshot data under `window.__affinoLaravelDiagnostics`.
   */
  diagnostics?: boolean
}

export type AffinoAdapterComponent =
  | "dialog"
  | "tooltip"
  | "popover"
  | "menu"
  | "listbox"
  | "combobox"
  | "tabs"
  | "disclosure"

export const AFFINO_DIALOG_MANUAL_EVENT = "affino-dialog:manual" as const
export const AFFINO_TOOLTIP_MANUAL_EVENT = "affino-tooltip:manual" as const
export const AFFINO_POPOVER_MANUAL_EVENT = "affino-popover:manual" as const
export const AFFINO_MENU_MANUAL_EVENT = "affino-menu:manual" as const
export const AFFINO_LISTBOX_MANUAL_EVENT = "affino-listbox:manual" as const
export const AFFINO_COMBOBOX_MANUAL_EVENT = "affino-combobox:manual" as const
export const AFFINO_TABS_MANUAL_EVENT = "affino-tabs:manual" as const
export const AFFINO_DISCLOSURE_MANUAL_EVENT = "affino-disclosure:manual" as const

export type AffinoManualEventName =
  | typeof AFFINO_DIALOG_MANUAL_EVENT
  | typeof AFFINO_TOOLTIP_MANUAL_EVENT
  | typeof AFFINO_POPOVER_MANUAL_EVENT
  | typeof AFFINO_MENU_MANUAL_EVENT
  | typeof AFFINO_LISTBOX_MANUAL_EVENT
  | typeof AFFINO_COMBOBOX_MANUAL_EVENT
  | typeof AFFINO_TABS_MANUAL_EVENT
  | typeof AFFINO_DISCLOSURE_MANUAL_EVENT

export type AffinoDialogManualAction = "open" | "close" | "toggle"
export type AffinoTooltipManualAction = "open" | "close" | "toggle"
export type AffinoPopoverManualAction = "open" | "close" | "toggle"
export type AffinoMenuManualAction = "open" | "close" | "toggle"
export type AffinoListboxManualAction = "open" | "close" | "toggle" | "select"
export type AffinoComboboxManualAction = AffinoListboxManualAction | "clear"
export type AffinoTabsManualAction = "select" | "clear"
export type AffinoDisclosureManualAction = "open" | "close" | "toggle"

/**
 * Manual event payload for dialogs. Supported actions: open, close, toggle.
 */
export type AffinoDialogManualEventDetail = {
  id: string
  action: AffinoDialogManualAction
  reason?: DialogOpenReason | DialogCloseReason
  options?: CloseRequestOptions
}

/**
 * Manual event payload for tooltips. Supported actions: open, close, toggle.
 */
export type AffinoTooltipManualEventDetail = {
  id: string
  action: AffinoTooltipManualAction
  reason?: TooltipReason
}

/**
 * Manual event payload for popovers. Supported actions: open, close, toggle.
 */
export type AffinoPopoverManualEventDetail = {
  id: string
  action: AffinoPopoverManualAction
  reason?: PopoverReason
}

/**
 * Manual event payload for menus. Supported actions: open, close, toggle.
 */
export type AffinoMenuManualEventDetail = {
  id: string
  action: AffinoMenuManualAction
  reason?: MenuReason
}

/**
 * Manual event payload for listboxes.
 * Actions:
 *  - open / close / toggle
 *  - select: requires either an index or value, plus optional extend/toggle flags for multiple mode.
 */
export type AffinoListboxManualEventDetail = {
  id: string
  action: AffinoListboxManualAction
  reason?: string
  index?: number
  value?: string
  extend?: boolean
  toggle?: boolean
}

/**
 * Manual event payload for comboboxes.
 * Actions mirror listboxes plus the `clear` action.
 */
export type AffinoComboboxManualEventDetail = {
  id: string
  action: AffinoComboboxManualAction
  reason?: string
  index?: number
  value?: string
  extend?: boolean
  toggle?: boolean
}

/**
 * Manual event payload for tabs.
 * Actions:
 *  - select: requires `value`
 *  - clear
 */
export type AffinoTabsManualEventDetail = {
  id: string
  action: AffinoTabsManualAction
  value?: string
}

/**
 * Manual event payload for disclosure primitives.
 * Supported actions: open, close, toggle.
 */
export type AffinoDisclosureManualEventDetail = {
  id: string
  action: AffinoDisclosureManualAction
  reason?: string
}

export type AffinoManualEventMap = {
  [AFFINO_DIALOG_MANUAL_EVENT]: AffinoDialogManualEventDetail
  [AFFINO_TOOLTIP_MANUAL_EVENT]: AffinoTooltipManualEventDetail
  [AFFINO_POPOVER_MANUAL_EVENT]: AffinoPopoverManualEventDetail
  [AFFINO_MENU_MANUAL_EVENT]: AffinoMenuManualEventDetail
  [AFFINO_LISTBOX_MANUAL_EVENT]: AffinoListboxManualEventDetail
  [AFFINO_COMBOBOX_MANUAL_EVENT]: AffinoComboboxManualEventDetail
  [AFFINO_TABS_MANUAL_EVENT]: AffinoTabsManualEventDetail
  [AFFINO_DISCLOSURE_MANUAL_EVENT]: AffinoDisclosureManualEventDetail
}

export type ManualDetailOf<EventName extends AffinoManualEventName> = AffinoManualEventMap[EventName]
