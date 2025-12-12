import { Comment, Fragment, Text, cloneVNode, defineComponent, isVNode, mergeProps, normalizeClass, unref } from "vue"

function resolveRefFunctions(ref: any): Array<(el: any) => void> {
  if (!ref) return []
  if (typeof ref === "function") return [ref]
  if (Array.isArray(ref)) return ref.flatMap(resolveRefFunctions)
  if (ref && typeof ref === "object" && typeof ref.r === "function") return [ref.r]
  return []
}

export default defineComponent({
  name: "UiAsChildRenderer",
  inheritAttrs: false,
  props: {
    componentLabel: { type: String, required: true },
    forwardedProps: { type: Object, required: true },
  },
  setup(props, { slots }) {
    return () => {
      const slotNodes = slots.default?.()
      const validNodes = extractValidVNodes(slotNodes)
      if (!validNodes.length) {
        throw new Error(`${props.componentLabel} expects exactly one child`)
      }
      if (validNodes.length > 1) {
        throw new Error(`${props.componentLabel} expects a single root node when using asChild`)
      }
      const vnode = validNodes[0]

      const forwarded = { ...(unref(props.forwardedProps) ?? {}) }
      const forwardedRef = forwarded.ref
      const forwardedClass = forwarded.class
      delete (forwarded as any).ref
      delete (forwarded as any).class

      const mergedProps = mergeProps(vnode.props ?? {}, forwarded)
      const userClass = vnode.props?.class

      const refFns = [
        ...resolveRefFunctions(vnode.ref),
        ...(forwardedRef ? resolveRefFunctions(forwardedRef) : []),
      ]

      const combinedRef = refFns.length ? (el: any) => refFns.forEach(fn => fn(el)) : undefined

      const dynamic = cloneVNode(vnode, { ...mergedProps, ref: combinedRef })
      if (forwardedClass || userClass) {
        dynamic.props = dynamic.props ?? {}
        dynamic.props.class = normalizeClass([forwardedClass, userClass])
      }
      demoteHoistedVNode(dynamic)
      return dynamic
    }
  },
})

function demoteHoistedVNode(vnode: any) {
  if (vnode.patchFlag === -1 /* HOISTED */) {
    vnode.patchFlag = 0
  }
  vnode.isStatic = false
  vnode.hoisted = undefined
}

function extractValidVNodes(children: any): any[] {
  const nodes = Array.isArray(children) ? children : [children]
  const result: any[] = []

  for (const child of nodes) {
    if (!isVNode(child)) continue
    if (child.type === Comment) continue
    if (child.type === Text && typeof child.children === "string" && child.children.trim() === "") continue
    if (child.type === Fragment) {
      const fragmentChildren = extractValidVNodes(child.children)
      result.push(...fragmentChildren)
      continue
    }
    result.push(child)
  }

  return result
}
