import { onMounted, onUnmounted } from "vue"
import { useMenuProvider } from "./context"
import type { MenuController } from "./useMenuController"

interface ShortcutDescriptor {
  key: string
  meta: boolean
  ctrl: boolean
  shift: boolean
  alt: boolean
}

interface ShortcutBinding {
  itemId: string
  parsed: ShortcutDescriptor
}

const shortcutCache = new Map<string, ShortcutDescriptor | null>()
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA"])

export function useMenuShortcuts(mapping: Record<string, string>): void {
  if (typeof window === "undefined") {
    return
  }

  const bindings = resolveBindings(mapping)

  if (!bindings.length) {
    return
  }

  const controller = resolveController()

  const requiresMeta = bindings.some((binding) => binding.parsed.meta)
  const requiresAlt = bindings.some((binding) => binding.parsed.alt)

  const handleKeydown = (event: KeyboardEvent) => {
    if (shouldIgnoreKeyboardEvent(event)) {
      return
    }
    if (event.metaKey && !requiresMeta) {
      return
    }
    if (event.altKey && !requiresAlt) {
      return
    }

    for (const binding of bindings) {
      if (matchDescriptor(event, binding.parsed)) {
        event.preventDefault()
        controller.select(binding.itemId)
        break
      }
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener("keydown", handleKeydown)
  })
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = getParsedShortcut(shortcut)
  if (!parsed) {
    return false
  }
  return matchDescriptor(event, parsed)
}

function resolveController(): MenuController {
  const provider = useMenuProvider()
  return provider.controller
}

function resolveBindings(mapping: Record<string, string>): ShortcutBinding[] {
  return Object.entries(mapping ?? {})
    .map(([itemId, shortcut]) => {
      const parsed = getParsedShortcut(shortcut)
      if (!parsed) {
        return null
      }
      return { itemId, parsed }
    })
    .filter((value): value is ShortcutBinding => Boolean(value))
}

function getParsedShortcut(shortcut: string): ShortcutDescriptor | null {
  const signature = shortcut.trim()
  if (signature.length === 0) {
    return null
  }
  if (!shortcutCache.has(signature)) {
    shortcutCache.set(signature, parseShortcut(signature))
  }
  return shortcutCache.get(signature) ?? null
}

function parseShortcut(shortcut: string): ShortcutDescriptor | null {
  const descriptor: ShortcutDescriptor = {
    key: "",
    meta: false,
    ctrl: false,
    shift: false,
    alt: false,
  }

  const parts = shortcut.split("+").map((part) => part.trim()).filter(Boolean)
  if (!parts.length) {
    return null
  }

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (isMetaModifier(lower)) {
      descriptor.meta = true
      continue
    }
    if (isCtrlModifier(lower)) {
      descriptor.ctrl = true
      continue
    }
    if (lower === "shift") {
      descriptor.shift = true
      continue
    }
    if (isAltModifier(lower)) {
      descriptor.alt = true
      continue
    }

    const normalizedKey = normalizeKeyName(part)
    if (normalizedKey) {
      descriptor.key = normalizedKey
    }
  }

  return descriptor.key ? descriptor : null
}

function isMetaModifier(value: string) {
  return value === "meta" || value === "cmd" || value === "command"
}

function isCtrlModifier(value: string) {
  return value === "ctrl" || value === "control"
}

function isAltModifier(value: string) {
  return value === "alt" || value === "option"
}

function matchDescriptor(event: KeyboardEvent, descriptor: ShortcutDescriptor): boolean {
  if (descriptor.meta !== event.metaKey) {
    return false
  }
  if (descriptor.ctrl !== event.ctrlKey) {
    return false
  }
  if (descriptor.shift !== event.shiftKey) {
    return false
  }
  if (descriptor.alt !== event.altKey) {
    return false
  }

  const eventKey = normalizeKeyName(event.key)
  if (!eventKey) {
    return false
  }

  return eventKey === descriptor.key
}

function normalizeKeyName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return ""
  }
  if (trimmed === " ") {
    return " "
  }
  const lower = trimmed.toLowerCase()
  if (lower === "space" || lower === "spacebar") {
    return " "
  }
  if (lower.startsWith("arrow")) {
    return `arrow${lower.slice(5)}`
  }
  return lower
}

function shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) {
    return true
  }
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return false
  }
  if (target.isContentEditable) {
    return true
  }
  if (EDITABLE_TAGS.has(target.tagName)) {
    return true
  }
  return false
}
