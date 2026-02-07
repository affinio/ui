import { describe, expect, it } from "vitest"
import * as adapter from "../index"

describe("laravel-adapter api surface", () => {
  it("keeps bootstrapAffinoLaravelAdapters as public entry point", () => {
    expect(typeof adapter.bootstrapAffinoLaravelAdapters).toBe("function")
  })

  it("does not expose internal livewire action bridge helper", () => {
    expect("bindLivewireActionBridge" in adapter).toBe(false)
  })
})
