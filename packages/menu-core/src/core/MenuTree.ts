export interface MenuTreeState {
  openPath: string[]
  activePath: string[]
}

interface TreeNode {
  id: string
  parentId: string | null
  parentItemId: string | null
}

type TreeListener = (state: MenuTreeState) => void

/**
 * Lightweight representation of the hierarchical menu structure. Nodes register themselves and
 * the tree keeps two pieces of derived state: the currently open chain of menus and the path of
 * highlighted submenu triggers. Consumers may subscribe to changes to coordinate complex closing
 * behaviour without ad-hoc parent subscriptions.
 */
export class MenuTree {
  private readonly nodes = new Map<string, TreeNode>()
  private readonly listeners = new Map<string, Set<TreeListener>>()
  private readonly itemToMenu = new Map<string, string>()
  private openPath: string[]
  private activePath: string[]

  constructor(rootId: string) {
    this.nodes.set(rootId, { id: rootId, parentId: null, parentItemId: null })
    this.openPath = [rootId]
    this.activePath = [rootId]
  }

  register(menuId: string, parentId: string | null, parentItemId: string | null) {
    if (this.nodes.has(menuId)) {
      throw new Error(`Menu with id "${menuId}" is already registered in the tree`)
    }
    this.nodes.set(menuId, { id: menuId, parentId, parentItemId })
    if (parentItemId) {
      this.itemToMenu.set(parentItemId, menuId)
    }
  }

  unregister(menuId: string) {
    const node = this.nodes.get(menuId)
    if (!node) return
    this.nodes.delete(menuId)
    if (node.parentItemId) {
      this.itemToMenu.delete(node.parentItemId)
    }
    this.listeners.delete(menuId)
    this.openPath = this.openPath.filter((id) => id !== menuId)
    this.activePath = this.activePath.filter((id) => id !== menuId)
    this.emit()
  }

  subscribe(menuId: string, listener: TreeListener) {
    const bucket = this.listeners.get(menuId) ?? new Set<TreeListener>()
    bucket.add(listener)
    this.listeners.set(menuId, bucket)
    listener(this.snapshot)
    return () => {
      bucket.delete(listener)
      if (bucket.size === 0) {
        this.listeners.delete(menuId)
      }
    }
  }

  updateOpenState(menuId: string, open: boolean) {
    if (open) {
      this.openPath = this.buildPath(menuId)
    } else {
      this.openPath = this.openPath.filter((id) => !this.isDescendantOf(id, menuId))
    }
    this.emit()
  }

  updateHighlight(menuId: string, highlightedItemId: string | null) {
    if (highlightedItemId) {
      const childMenuId = this.itemToMenu.get(highlightedItemId)
      if (childMenuId) {
        this.activePath = this.buildPath(childMenuId)
        this.emit()
        return
      }
    }
    if (!this.activePath.includes(menuId)) {
      return
    }
    this.activePath = this.buildPath(menuId)
    this.emit()
  }

  get snapshot(): MenuTreeState {
    return {
      openPath: [...this.openPath],
      activePath: [...this.activePath],
    }
  }

  private emit() {
    const snapshot = this.snapshot
    for (const listeners of this.listeners.values()) {
      for (const listener of listeners) {
        listener(snapshot)
      }
    }
  }

  private buildPath(menuId: string): string[] {
    const path: string[] = []
    let current: TreeNode | undefined = this.nodes.get(menuId)
    while (current) {
      path.push(current.id)
      current = current.parentId ? this.nodes.get(current.parentId) : undefined
    }
    return path.reverse()
  }

  private isDescendantOf(targetId: string, ancestorId: string): boolean {
    if (targetId === ancestorId) return true
    let node = this.nodes.get(targetId)
    while (node) {
      if (node.parentId === ancestorId) {
        return true
      }
      node = node.parentId ? this.nodes.get(node.parentId) : undefined
    }
    return false
  }
}
