import { defineComponent, h } from "vue"
import { UiWorkspaceTabs } from "@affino/tabs-vue"

const tabs = [
  { id: "settings", label: "Settings", to: "/settings", closable: false },
  { id: "document", label: "Document", to: "/document", closable: true },
]

export default defineComponent({
  name: "SesTabsVueConsumer",
  setup() {
    return () => h(UiWorkspaceTabs, { tabs, activeId: "document" })
  },
})
