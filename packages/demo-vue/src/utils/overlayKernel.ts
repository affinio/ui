import { createAffinoVueAdapter, initializeOverlayKernel as initializeFromAdapter } from "@affino/vue-adapter"
import type { OverlayEntry } from "@affino/overlay-kernel"

const runtime = createAffinoVueAdapter({
  exposeManagerOnWindow: import.meta.env.DEV,
})

export function initializeOverlayKernel(targetDocument: Document | null = typeof document !== "undefined" ? document : null) {
  return initializeFromAdapter({
    document: targetDocument,
    exposeManagerOnWindow: import.meta.env.DEV,
  })
}

export type OverlayStackSubscriber = (stack: readonly OverlayEntry[]) => void

export function subscribeToOverlayStack(subscriber: OverlayStackSubscriber): () => void {
  return runtime.subscribeToOverlayStack(subscriber)
}
