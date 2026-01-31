function getProcessEnv(): Record<string, unknown> | undefined {
  if (typeof globalThis === "undefined") {
    return undefined
  }
  const candidate = (globalThis as { process?: { env?: Record<string, unknown> } }).process
  return candidate?.env
}

export function isDebugMenuEnabled(): boolean {
  return (
    Boolean(getProcessEnv()?.DEBUG_MENU) ||
    (typeof globalThis !== "undefined" && Boolean((globalThis as Record<string, unknown>).__MENU_DEBUG__))
  )
}
