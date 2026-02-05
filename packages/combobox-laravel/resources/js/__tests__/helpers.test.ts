import { describe, expect, it } from "vitest"

import { __testing } from "../index"

const { readBoolean, resolveMode, normalizeFilter, optionMatches, escapeIdentifier } = __testing

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
})
