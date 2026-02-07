import { describe, expect, it } from "vitest"

import { __testing } from "../index"

const { readBoolean, resolveMode, normalizeFilter, optionMatches, escapeIdentifier, hasStructureChanged } = __testing

describe("combobox laravel helpers", () => {
  it("normalizes boolean attributes with sensible fallbacks", () => {
    expect(readBoolean(undefined, true)).toBe(true)
    expect(readBoolean("true", false)).toBe(true)
    expect(readBoolean("false", true)).toBe(false)
    expect(readBoolean("maybe" as any, false)).toBe(false)
  })

  it("resolves combobox mode identifiers", () => {
    expect(resolveMode("multiple")).toBe("multiple")
    expect(resolveMode()).toBe("single")
  })

  it("sanitizes filter queries and matches option labels", () => {
    const option = {
      dataset: { affinoListboxLabel: "Hello World" },
      textContent: null,
    } as any

    expect(normalizeFilter("  HeLLo  ")).toBe("hello")
    expect(optionMatches(option, "hello")).toBe(true)
    expect(optionMatches(option, "bye")).toBe(false)
  })

  it("escapes arbitrary identifiers deterministically", () => {
    expect(escapeIdentifier("alpha")).toBe("alpha")
    expect(escapeIdentifier("value/id")).toBe("value-2f-id")
  })

  it("invalidates options cache only on structural changes", () => {
    const input = {} as HTMLInputElement
    let optionCount = 1
    const surface = {
      querySelectorAll: () => ({ length: optionCount }),
    } as unknown as HTMLElement
    const root = {
      querySelector: (selector: string) => {
        if (selector === "[data-affino-combobox-input]") {
          return input
        }
        if (selector === "[data-affino-combobox-surface]") {
          return surface
        }
        return null
      },
    }

    const cache = { input, surface, optionCount: 1 }
    expect(hasStructureChanged(root as any, cache as any)).toBe(false)

    optionCount = 2
    expect(hasStructureChanged(root as any, cache as any)).toBe(true)
  })

  it("treats missing key nodes as structural changes", () => {
    const input = {} as HTMLInputElement
    const surface = {
      querySelectorAll: () => ({ length: 1 }),
    } as unknown as HTMLElement
    const root = {
      querySelector: (selector: string) => {
        if (selector === "[data-affino-combobox-input]") {
          return null
        }
        if (selector === "[data-affino-combobox-surface]") {
          return surface
        }
        return null
      },
    }

    const cache = { input, surface, optionCount: 1 }
    expect(hasStructureChanged(root as any, cache as any)).toBe(true)
  })
})
