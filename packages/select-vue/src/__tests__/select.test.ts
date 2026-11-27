import { mount } from "@vue/test-utils"
import { nextTick } from "vue"
import { describe, expect, it } from "vitest"
import { getDocumentOverlayManager } from "@affino/overlay-kernel"
import AffinoSelect from "../AffinoSelect.vue"

const options = [{ value: "one", label: "One" }, { value: "two", label: "Two" }, { value: "off", label: "Disabled", disabled: true }]

describe("AffinoSelect", () => {
  it("renders the controlled value and commits only a changed enabled option", async () => {
    const wrapper = mount(AffinoSelect, { props: { modelValue: "one", options, ariaLabel: "Choice" }, attachTo: document.body })
    expect(wrapper.get('[role="combobox"]').text()).toContain("One")
    await wrapper.get('[role="combobox"]').trigger("click")
    await nextTick()
    document.querySelector<HTMLElement>('[role="option"][id$="option-1"]')?.click()
    await nextTick()
    expect(wrapper.emitted("update:modelValue")).toEqual([["two"]])
    expect(wrapper.emitted("update:modelValue")).toHaveLength(1)
    wrapper.unmount()
  })

  it("preserves unknown and empty values without mount emissions", async () => {
    const wrapper = mount(AffinoSelect, { props: { modelValue: "external", options: [], ariaLabel: "Choice" } })
    expect(wrapper.get('[role="combobox"]').text()).toContain("Select an option")
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    await wrapper.get('[role="combobox"]').trigger("keydown", { key: "ArrowDown" })
    await wrapper.get('[role="combobox"]').trigger("keydown", { key: "Enter" })
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    await wrapper.setProps({ modelValue: null, options: [{ value: 1, label: "One" }] })
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
  })

  it("navigates without committing and Escape leaves the controlled value intact", async () => {
    const wrapper = mount(AffinoSelect, { props: { modelValue: "one", options, ariaLabel: "Choice" } })
    const trigger = wrapper.get('[role="combobox"]')
    await trigger.trigger("keydown", { key: "ArrowDown" })
    await nextTick()
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    await trigger.trigger("keydown", { key: "Escape" })
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    expect(trigger.attributes("aria-expanded")).toBe("false")
  })

  it("supports Home, End, and Space without committing during navigation", async () => {
    const wrapper = mount(AffinoSelect, { props: { modelValue: "one", options, ariaLabel: "Keyboard choice" }, attachTo: document.body })
    const trigger = wrapper.get('[role="combobox"]')
    await trigger.trigger("keydown", { key: "ArrowDown" })
    await trigger.trigger("keydown", { key: "End" })
    expect(trigger.attributes("aria-activedescendant")).toMatch(/option-1$/)
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    await trigger.trigger("keydown", { key: "Home" })
    expect(trigger.attributes("aria-activedescendant")).toMatch(/option-0$/)
    await trigger.trigger("keydown", { key: "End" })
    await trigger.trigger("keydown", { key: " " })
    expect(wrapper.emitted("update:modelValue")).toEqual([["two"]])
    wrapper.unmount()
  })

  it("preserves numeric values, skips disabled options, and exposes the active option", async () => {
    const numericOptions = [{ value: 10, label: "Ten" }, { value: 20, label: "Twenty", disabled: true }, { value: 30, label: "Thirty" }]
    const wrapper = mount(AffinoSelect, { props: { modelValue: 10, options: numericOptions, ariaLabel: "Numeric choice" }, attachTo: document.body })
    const trigger = wrapper.get('[role="combobox"]')
    expect(trigger.attributes("aria-label")).toBe("Numeric choice")
    await trigger.trigger("keydown", { key: "ArrowDown" })
    await trigger.trigger("keydown", { key: "ArrowDown" })
    expect(trigger.attributes("aria-activedescendant")).toContain("option-2")
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    await trigger.trigger("keydown", { key: "Enter" })
    expect(wrapper.emitted("update:modelValue")).toEqual([[30]])
    expect(typeof wrapper.emitted("update:modelValue")?.[0]?.[0]).toBe("number")
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it("does not open while disabled and keeps the first duplicate value as the display", async () => {
    const wrapper = mount(AffinoSelect, { props: { modelValue: "same", options: [{ value: "same", label: "First" }, { value: "same", label: "Second" }], ariaLabel: "Duplicate" } })
    expect(wrapper.get('[role="combobox"]').text()).toContain("First")
    await wrapper.get('[role="combobox"]').trigger("click")
    expect(document.querySelectorAll('[role="option"][aria-selected="true"]')).toHaveLength(2)
    await wrapper.get('[role="combobox"]').trigger("keydown", { key: "Enter" })
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    wrapper.unmount()
  })

  it("does not open while disabled and keeps a disabled selected value visible", async () => {
    const disabledOption = [{ value: "locked", label: "Locked choice", disabled: true }, { value: "free", label: "Free choice" }]
    const wrapper = mount(AffinoSelect, { props: { modelValue: "locked", options: disabledOption, disabled: true, ariaLabel: "Duplicate" } })
    expect(wrapper.get('[role="combobox"]').text()).toContain("Locked choice")
    await wrapper.get('[role="combobox"]').trigger("click")
    expect(wrapper.get('[role="combobox"]').attributes("aria-expanded")).toBe("false")
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    wrapper.unmount()
  })

  it("reacts to external value and option replacement without emitting updates", async () => {
    const wrapper = mount(AffinoSelect, { props: { modelValue: "one", options, ariaLabel: "Choice" } })
    await wrapper.setProps({ modelValue: "two", options: [{ value: "two", label: "Updated Two" }] })
    expect(wrapper.get('[role="combobox"]').text()).toContain("Updated Two")
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    await wrapper.setProps({ modelValue: "missing", options: [{ value: "two", label: "Updated Two" }], placeholder: "Unavailable" })
    expect(wrapper.get('[role="combobox"]').text()).toContain("Unavailable")
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    wrapper.unmount()
  })

  it("supports typeahead and cleans up when disposed while open", async () => {
    const wrapper = mount(AffinoSelect, { props: { modelValue: "one", options, ariaLabel: "Choice" }, attachTo: document.body })
    const trigger = wrapper.get('[role="combobox"]')
    await trigger.trigger("keydown", { key: "o" })
    const activeId = trigger.attributes("aria-activedescendant")
    expect(document.getElementById(activeId!)?.textContent).toBe("One")
    wrapper.unmount()
    document.body.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
  })

  it("wires aria-labelledby, listbox selection state, and active descendants", async () => {
    const wrapper = mount({
      components: { AffinoSelect },
      template: '<div><span id="paper-label">Paper size</span><AffinoSelect v-model="value" :options="options" aria-labelledby="paper-label" /></div>',
      data: () => ({ value: "one", options }),
    }, { attachTo: document.body })
    const trigger = wrapper.get('[role="combobox"]')
    expect(trigger.attributes("aria-labelledby")).toBe("paper-label")
    await trigger.trigger("keydown", { key: "ArrowDown" })
    expect(trigger.attributes("aria-activedescendant")).toMatch(/option-0$/)
    expect(document.getElementById(trigger.attributes("aria-activedescendant"))).not.toBeNull()
    const listbox = document.getElementById(trigger.attributes("aria-controls"))!
    expect(listbox.getAttribute("role")).toBe("listbox")
    expect(listbox.getAttribute("aria-labelledby")).toBe("paper-label")
    expect(listbox.querySelector('[role="option"][aria-selected="true"]')?.textContent).toBe("One")
    expect(listbox.querySelector('[role="option"][aria-disabled="true"]')?.textContent).toBe("Disabled")
    wrapper.unmount()
  })

  it("controls open state and keeps independent instances isolated", async () => {
    const wrapper = mount({
      components: { AffinoSelect },
      template: '<div><AffinoSelect v-model="left" v-model:open="leftOpen" :options="options" aria-label="Left" /><AffinoSelect v-model="right" :options="options" aria-label="Right" /></div>',
      data: () => ({ left: "one", right: "two", leftOpen: false, options }),
    }, { attachTo: document.body })
    const [left, right] = wrapper.findAll('[role="combobox"]')
    const leftSelect = wrapper.findAllComponents(AffinoSelect)[0]!
    expect(left!.attributes("id")).not.toBe(right!.attributes("id"))
    await left!.trigger("click")
    expect(leftSelect.emitted("update:open")).toEqual([[true]])
    expect(left!.attributes("aria-expanded")).toBe("true")
    expect(right!.attributes("aria-expanded")).toBe("false")
    expect(document.getElementById(left!.attributes("aria-controls"))).not.toBeNull()
    await wrapper.setData({ leftOpen: false })
    await nextTick()
    expect(left!.attributes("aria-expanded")).toBe("false")
    expect(leftSelect.emitted("update:open")).toEqual([[true]])
    wrapper.unmount()
  })

  it("removes its overlay entry when disposed while open", async () => {
    const manager = getDocumentOverlayManager(document)
    const stackBefore = manager.getStack().map(entry => entry.id)
    const wrapper = mount(AffinoSelect, { props: { modelValue: "one", options, ariaLabel: "Cleanup" }, attachTo: document.body })
    await wrapper.get('[role="combobox"]').trigger("click")
    const openStack = manager.getStack().map(entry => entry.id)
    expect(openStack.length).toBe(stackBefore.length + 1)
    wrapper.unmount()
    expect(manager.getStack().map(entry => entry.id)).toEqual(stackBefore)
  })

  it("does not coerce numeric options to string values", async () => {
    const wrapper = mount(AffinoSelect, { props: { modelValue: 1, options: [{ value: "1", label: "String one" }], placeholder: "No exact match", ariaLabel: "Strict value" } })
    expect(wrapper.get('[role="combobox"]').text()).toContain("No exact match")
    expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    wrapper.unmount()
  })
})
