// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { mount } from "@vue/test-utils"
import SesTabsVueConsumer from "./fixtures/SesTabsVueConsumer"

describe("built tabs-vue consumer", () => {
  it("loads and renders an SES component through the package ESM export", () => {
    const wrapper = mount(SesTabsVueConsumer)
    expect(wrapper.find('[role="tablist"]').exists()).toBe(true)
    expect(wrapper.get('[role="tab"][aria-selected="true"]').text()).toBe("Document")
    wrapper.unmount()
  })
})
