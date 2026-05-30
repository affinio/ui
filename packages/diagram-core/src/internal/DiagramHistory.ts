import type { HistoryEntry, Patch } from "./model.js"

export class DiagramHistory {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  undoDepth(): number {
    return this.undoStack.length
  }

  redoDepth(): number {
    return this.redoStack.length
  }

  popUndo(): HistoryEntry | null {
    return this.undoStack.pop() ?? null
  }

  pushUndo(entry: HistoryEntry): void {
    this.undoStack.push(entry)
  }

  popRedo(): HistoryEntry | null {
    return this.redoStack.pop() ?? null
  }

  pushRedo(entry: HistoryEntry): void {
    this.redoStack.push(entry)
  }

  record(patch: Patch, historyKey: string | null, compose: (first: Patch, second: Patch) => Patch): void {
    const previous = historyKey ? this.undoStack[this.undoStack.length - 1] : null
    if (previous?.key === historyKey) {
      previous.patch = compose(previous.patch, patch)
      previous.inverse = compose(patch.inverse, previous.inverse)
    } else {
      this.undoStack.push({ patch, inverse: patch.inverse, key: historyKey })
    }
    this.redoStack = []
  }
}
