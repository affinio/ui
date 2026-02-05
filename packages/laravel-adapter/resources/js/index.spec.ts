import { describe, expect, it } from "vitest"
import {
  AFFINO_COMBOBOX_MANUAL_EVENT,
  AFFINO_DISCLOSURE_MANUAL_EVENT,
  AFFINO_DIALOG_MANUAL_EVENT,
  AFFINO_LISTBOX_MANUAL_EVENT,
  AFFINO_MENU_MANUAL_EVENT,
  AFFINO_POPOVER_MANUAL_EVENT,
  AFFINO_TABS_MANUAL_EVENT,
  AFFINO_TOOLTIP_MANUAL_EVENT,
  bootstrapAffinoLaravelAdapters,
} from "./index"

describe("@affino/laravel-adapter", () => {
  it("exports stable manual event names", () => {
    expect(AFFINO_DIALOG_MANUAL_EVENT).toBe("affino-dialog:manual")
    expect(AFFINO_TOOLTIP_MANUAL_EVENT).toBe("affino-tooltip:manual")
    expect(AFFINO_POPOVER_MANUAL_EVENT).toBe("affino-popover:manual")
    expect(AFFINO_MENU_MANUAL_EVENT).toBe("affino-menu:manual")
    expect(AFFINO_LISTBOX_MANUAL_EVENT).toBe("affino-listbox:manual")
    expect(AFFINO_COMBOBOX_MANUAL_EVENT).toBe("affino-combobox:manual")
    expect(AFFINO_TABS_MANUAL_EVENT).toBe("affino-tabs:manual")
    expect(AFFINO_DISCLOSURE_MANUAL_EVENT).toBe("affino-disclosure:manual")
  })

  it("exposes bootstrap runtime function", () => {
    expect(typeof bootstrapAffinoLaravelAdapters).toBe("function")
  })
})
