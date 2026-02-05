import type { Meta, StoryObj } from "@storybook/vue3"
import {
  createLinearSelectionStore,
  createListboxStore,
  useLinearSelectionStore,
  useListboxStore,
} from "@affino/selection-vue"

const meta = {
  title: "Vue Adapters/Selection/Linear + Listbox",
  tags: ["autodocs"],
  args: {
    optionCount: 6,
  },
  argTypes: {
    optionCount: {
      control: { type: "range", min: 1, max: 20, step: 1 },
    },
  },
  render: (args: { optionCount: number }) => ({
    setup() {
      const linearStore = createLinearSelectionStore()
      const linear = useLinearSelectionStore(linearStore)

      const listboxStore = createListboxStore({
        context: { optionCount: args.optionCount, selectionMode: "multiple" },
      })
      const listbox = useListboxStore(listboxStore)

      const selectRange = () => {
        linearStore.setState({
          ranges: [{ start: 1, end: 3 }],
          activeRangeIndex: 0,
          anchor: 1,
          focus: 3,
        })
      }

      const clearLinear = () => {
        linearStore.setState({
          ranges: [],
          activeRangeIndex: -1,
          anchor: null,
          focus: null,
        })
      }

      return {
        linear,
        listbox,
        listboxStore,
        selectRange,
        clearLinear,
      }
    },
    template: `
      <div style="display: grid; gap: 18px; min-width: 640px;">
        <section style="display: grid; gap: 8px;">
          <h4 style="margin: 0;">Linear selection store</h4>
          <div style="display: flex; gap: 8px;">
            <button type="button" @click="selectRange()">Select 1..3</button>
            <button type="button" @click="clearLinear()">Clear</button>
          </div>
          <pre style="margin: 0; background: #f6f8fb; border: 1px solid #e5e7eb; padding: 10px; border-radius: 8px;">{{ linear.state.value }}</pre>
        </section>

        <section style="display: grid; gap: 8px;">
          <h4 style="margin: 0;">Listbox store</h4>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" @click="listboxStore.activate(0)">Activate 0</button>
            <button type="button" @click="listboxStore.move(1, { loop: true })">Move +1</button>
            <button type="button" @click="listboxStore.toggleActiveOption()">Toggle active</button>
            <button type="button" @click="listboxStore.selectAll()">Select all</button>
            <button type="button" @click="listboxStore.clearSelection()">Clear</button>
          </div>
          <pre style="margin: 0; background: #f6f8fb; border: 1px solid #e5e7eb; padding: 10px; border-radius: 8px;">{{ listbox.state.value }}</pre>
        </section>
      </div>
    `,
  }),
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Basic: Story = {}
