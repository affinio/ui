import { getCurrentInstance } from "vue"

let counter = 0
const instanceCounters = new WeakMap<object, number>()
const instancePaths = new WeakMap<object, string>()
const childCounters = new WeakMap<object, Map<string, number>>()

function getInstancePath(instance: { parent: { type: unknown } | null; type: unknown }): string {
  const cached = instancePaths.get(instance)
  if (cached) return cached

  const parent = instance.parent
  if (!parent) {
    instancePaths.set(instance, "0")
    return "0"
  }

  const parentPath = getInstancePath(parent as typeof instance)
  const type = instance.type as { __name?: string; name?: string }
  const name = (type.__name || type.name || "component").replace(/[^a-z0-9_-]/gi, "_")
  const counters = childCounters.get(parent) ?? new Map<string, number>()
  const ordinal = (counters.get(name) ?? 0) + 1
  counters.set(name, ordinal)
  childCounters.set(parent, counters)
  const path = `${parentPath}-${name}-${ordinal}`
  instancePaths.set(instance, path)
  return path
}

export function uid(prefix = "ui-menu") {
  const instance = getCurrentInstance()
  if (instance) {
    const next = (instanceCounters.get(instance) ?? 0) + 1
    instanceCounters.set(instance, next)
    return `${prefix}-${getInstancePath(instance)}-${next}`
  }
  counter += 1
  return `${prefix}-${counter}`
}
