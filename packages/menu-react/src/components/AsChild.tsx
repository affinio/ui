import { Children, cloneElement, isValidElement } from "react"
import type { ReactElement, ReactNode, Ref } from "react"

interface AsChildProps {
  componentLabel: string
  forwardedProps: Record<string, unknown>
  children: ReactNode
}

export function AsChild({ componentLabel, forwardedProps, children }: AsChildProps) {
  const onlyChild = Children.only(children)
  if (!isValidElement(onlyChild)) {
    throw new Error(`${componentLabel} expects a single valid React element as its child`)
  }
  type ElementWithRef = ReactElement & { ref?: Ref<unknown> | undefined }
  const element = onlyChild as ElementWithRef

  const { ref: forwardedRef, className: forwardedClassName, ...restForwarded } = forwardedProps
  const composedRef = composeRefs(element.ref, forwardedRef as Ref<unknown> | undefined)

  const mergedClassName = [forwardedClassName, element.props.className].filter(Boolean).join(" ").trim() || undefined

  const mergedProps: Record<string, unknown> = {
    ...element.props,
    ...restForwarded,
    ref: composedRef,
  }

  if (mergedClassName) {
    mergedProps.className = mergedClassName
  }

  return cloneElement(element, mergedProps)
}

function composeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  const validRefs = refs.filter(Boolean)
  if (!validRefs.length) {
    return undefined
  }
  return (value: T) => {
    for (const ref of validRefs) {
      if (typeof ref === "function") {
        ref(value)
        continue
      }
      if (ref && typeof ref === "object") {
        ;(ref as any).current = value
      }
    }
  }
}
