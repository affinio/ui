// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import SesTabsConsumer from "./fixtures/SesTabsConsumer"

describe("built tabs-core consumer", () => {
  it("loads an SES-style Vue component against the package ESM export", () => {
    const wrapper = mount(SesTabsConsumer)
    expect(wrapper.get('[data-testid="active-ses-tab"]').text()).toBe("document")
    wrapper.unmount()
  })
})
