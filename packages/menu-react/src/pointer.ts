import type { PointerEventLike, PointerMeta } from "@affino/menu-core"

type PointerLikeEvent = PointerEvent | MouseEvent

export function toPointerPayload(event: PointerLikeEvent, meta: PointerMeta = {}): PointerEventLike {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    meta,
    preventDefault: () => event.preventDefault(),
  }
}
