import type { Meta, StoryObj } from "@storybook/vue3"
import { createGridSelectionStore, useGridSelectionStore } from "@affino/grid-selection-vue"

const meta = {
  title: "Vue Adapters/Selection/Grid Selection",
  tags: ["autodocs"],
  render: () => ({
    setup() {
      const store = createGridSelectionStore<string>()
      const selection = useGridSelectionStore(store)

      const selectArea = () => {
        store.setState({
          ranges: [
            {
              startRow: 1,
              endRow: 2,
              startCol: 0,
              endCol: 2,
              anchor: { rowIndex: 1, colIndex: 0, rowId: null },
              focus: { rowIndex: 2, colIndex: 2, rowId: null },
              startRowId: null,
              endRowId: null,
            },
          ],
          areas: [{ startRow: 1, endRow: 2, startCol: 0, endCol: 2 }],
          activeRangeIndex: 0,
          selectedPoint: { rowIndex: 2, colIndex: 2, rowId: null },
          anchorPoint: { rowIndex: 1, colIndex: 0, rowId: null },
          dragAnchorPoint: null,
        })
      }

      const clear = () => {
        store.setState({
          ranges: [],
          areas: [],
          activeRangeIndex: -1,
          selectedPoint: null,
          anchorPoint: null,
          dragAnchorPoint: null,
        })
      }

      return {
        selection,
        selectArea,
        clear,
      }
    },
    template: `
      <div style="display: grid; gap: 10px; min-width: 620px;">
        <div style="display: flex; gap: 8px;">
          <button type="button" @click="selectArea()">Select area (1,0) → (2,2)</button>
          <button type="button" @click="clear()">Clear</button>
        </div>
        <pre style="margin: 0; background: #f6f8fb; border: 1px solid #e5e7eb; padding: 10px; border-radius: 8px;">{{ selection.state.value }}</pre>
      </div>
    `,
  }),
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

export const Basic: Story = {}
