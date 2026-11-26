import { defineComponent, h } from "vue"
import { TabsCore } from "@affino/tabs-core"

export default defineComponent({
  name: "SesTabsConsumer",
  setup() {
    const tabs = new TabsCore("settings")
    tabs.select("document")
    return () => h("span", { "data-testid": "active-ses-tab" }, tabs.getSnapshot().value ?? "")
  },
})
