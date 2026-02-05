import { describe, expect, it } from "vitest"

import { acquireDocumentScrollLock, releaseDocumentScrollLock } from "../index.ts"

type FakeDoc = {
  documentElement: {
    style: {
      overflow: string
    }
  }
}

function createFakeDocument(overflow = ""): Document {
  return {
    documentElement: {
      style: {
        overflow,
      },
    },
  } as unknown as Document
}

describe("document scroll lock", () => {
  it("keeps lock until all overlay sources release", () => {
    const doc = createFakeDocument("auto")

    acquireDocumentScrollLock(doc, "dialog")
    expect((doc as unknown as FakeDoc).documentElement.style.overflow).toBe("hidden")

    acquireDocumentScrollLock(doc, "popover")
    expect((doc as unknown as FakeDoc).documentElement.style.overflow).toBe("hidden")

    releaseDocumentScrollLock(doc, "dialog")
    expect((doc as unknown as FakeDoc).documentElement.style.overflow).toBe("hidden")

    releaseDocumentScrollLock(doc, "popover")
    expect((doc as unknown as FakeDoc).documentElement.style.overflow).toBe("auto")
  })

  it("tracks nested lock depth for the same source", () => {
    const doc = createFakeDocument("")

    acquireDocumentScrollLock(doc, "menu")
    acquireDocumentScrollLock(doc, "menu")
    expect((doc as unknown as FakeDoc).documentElement.style.overflow).toBe("hidden")

    releaseDocumentScrollLock(doc, "menu")
    expect((doc as unknown as FakeDoc).documentElement.style.overflow).toBe("hidden")

    releaseDocumentScrollLock(doc, "menu")
    expect((doc as unknown as FakeDoc).documentElement.style.overflow).toBe("")
  })

  it("isolates lock state per document", () => {
    const docA = createFakeDocument("auto")
    const docB = createFakeDocument("scroll")

    acquireDocumentScrollLock(docA, "dialog")
    expect((docA as unknown as FakeDoc).documentElement.style.overflow).toBe("hidden")
    expect((docB as unknown as FakeDoc).documentElement.style.overflow).toBe("scroll")

    acquireDocumentScrollLock(docB, "popover")
    expect((docA as unknown as FakeDoc).documentElement.style.overflow).toBe("hidden")
    expect((docB as unknown as FakeDoc).documentElement.style.overflow).toBe("hidden")

    releaseDocumentScrollLock(docA, "dialog")
    expect((docA as unknown as FakeDoc).documentElement.style.overflow).toBe("auto")
    expect((docB as unknown as FakeDoc).documentElement.style.overflow).toBe("hidden")

    releaseDocumentScrollLock(docB, "popover")
    expect((docB as unknown as FakeDoc).documentElement.style.overflow).toBe("scroll")
  })
})
