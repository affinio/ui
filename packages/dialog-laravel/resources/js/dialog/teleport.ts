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
  const ownerId = overlay.dataset.affinoDialogOwner?.trim()
  if (ownerId) {
    const selector = `[data-affino-dialog-overlay][data-affino-dialog-owner="${escapeAttributeValue(ownerId)}"]`
    const duplicates = Array.from(host.querySelectorAll<OverlayEl>(selector)).filter((candidate) => candidate !== overlay)
    duplicates.forEach((candidate) => candidate.remove())
  }
  const ownerOverlayId = root.dataset.affinoDialogOwnerId?.trim()
  const parent = overlay.parentElement
  const nextSibling = overlay.nextSibling
  const placeholder = doc.createComment("affino-dialog-portal")
  parent?.replaceChild(placeholder, overlay)
  if (ownerOverlayId) {
    const ownerSelector = `[data-affino-dialog-overlay][data-affino-dialog-owner="${escapeAttributeValue(ownerOverlayId)}"]`
    const ownerOverlay = host.querySelector<OverlayEl>(ownerSelector)
    if (ownerOverlay?.parentElement === host) {
      host.insertBefore(overlay, ownerOverlay.nextSibling)
    } else {
      host.appendChild(overlay)
    }
  } else {
    host.appendChild(overlay)
  }
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

function escapeAttributeValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  let result = ""
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index)
    const char = value.charAt(index)
    const isDigit = codePoint >= 48 && codePoint <= 57
    const isUpper = codePoint >= 65 && codePoint <= 90
    const isLower = codePoint >= 97 && codePoint <= 122
    const isAsciiAlphaNum = isDigit || isUpper || isLower
    const isAllowedPunctuation = char === "-" || char === "_"
    const isControl = codePoint === 0 || (codePoint >= 1 && codePoint <= 31) || codePoint === 127

    if (isControl) {
      const escapedCode = codePoint === 0 ? "fffd" : codePoint.toString(16)
      result += `\\${escapedCode} `
      continue
    }

    if ((index === 0 && isDigit) || (index === 1 && isDigit && value.charAt(0) === "-")) {
      result += `\\${codePoint.toString(16)} `
      continue
    }

    if (index === 0 && char === "-" && value.length === 1) {
      result += "\\-"
      continue
    }

    if (isAsciiAlphaNum || isAllowedPunctuation || codePoint >= 128) {
      result += char
      continue
    }

    result += `\\${char}`
  }

  return result
}

export { maybeTeleportOverlay }
