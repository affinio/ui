import { describe, expect, it } from "vitest"
import { createDialogFocusOrchestrator } from "../createDialogFocusOrchestrator.js"

function appendFocusable(tag = "button"): HTMLElement {
  const el = document.createElement(tag)
  if (tag === "div") {
    el.tabIndex = -1
  }
  document.body.append(el)
  return el
}

describe("createDialogFocusOrchestrator", () => {
  it("focuses the dialog on activate and restores focus on deactivate", () => {
    const trigger = appendFocusable("button")
    const dialog = appendFocusable("div")
    trigger.focus()

    const orchestrator = createDialogFocusOrchestrator({
      dialog: () => dialog,
      returnFocus: () => trigger,
    })

    orchestrator.activate({ reason: "programmatic" })
    expect(document.activeElement).toBe(dialog)

    orchestrator.deactivate({ reason: "programmatic" })
    expect(document.activeElement).toBe(trigger)

    trigger.remove()
    dialog.remove()
  })

  it("falls back to the previously focused element when returnFocus is missing", () => {
    const trigger = appendFocusable("button")
    const dialog = appendFocusable("div")
    trigger.focus()

    const orchestrator = createDialogFocusOrchestrator({
      dialog: () => dialog,
    })

    orchestrator.activate({ reason: "programmatic" })
    expect(document.activeElement).toBe(dialog)

    orchestrator.deactivate({ reason: "programmatic" })
    expect(document.activeElement).toBe(trigger)

    trigger.remove()
    dialog.remove()
  })
})
