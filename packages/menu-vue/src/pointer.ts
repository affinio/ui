import type { PointerEventLike, PointerMeta } from "@affino/menu-core"

export function toPointerPayload(event: PointerEvent, meta: PointerMeta = {}): PointerEventLike {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    meta,
    preventDefault: () => event.preventDefault(),
  }
}
