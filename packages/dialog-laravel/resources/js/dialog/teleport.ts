import { ensureOverlayHost } from "@affino/overlay-host"
import type { OverlayEl, RootEl } from "./types"

function maybeTeleportOverlay(root: RootEl, overlay: OverlayEl, target: string | null): (() => void) | null {
  if (!target) {
    return null
  }
  const doc = root.ownerDocument ?? document
  let host: HTMLElement | null = null
  if (target === "auto" || target === "#affino-dialog-host") {
    host = ensureOverlayHost({ id: "affino-dialog-host", attribute: "data-affino-dialog-host", document: doc })
  } else {
    host = doc.querySelector<HTMLElement>(target)
  }
  if (!host || overlay.parentElement === host) {
    return null
  }
  const parent = overlay.parentElement
  const nextSibling = overlay.nextSibling
  const placeholder = doc.createComment("affino-dialog-portal")
  parent?.replaceChild(placeholder, overlay)
  host.appendChild(overlay)
  return () => {
    if (placeholder.parentNode) {
      placeholder.parentNode.replaceChild(overlay, placeholder)
      return
    }
    if (parent?.isConnected) {
      if (nextSibling && nextSibling.parentNode === parent) {
        parent.insertBefore(overlay, nextSibling)
      } else {
        parent.appendChild(overlay)
      }
      return
    }
    overlay.remove()
  }
}

export { maybeTeleportOverlay }
