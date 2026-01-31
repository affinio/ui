import type { PositionOptions, Rect } from "../types"

type DiagnosticsReporter = (message: string, details?: Record<string, unknown>) => void

type RectKey = keyof Rect

function resolveDevFlag() {
  const globalProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  if (!globalProcess?.env?.NODE_ENV) {
    return true
  }
  return globalProcess.env.NODE_ENV !== "production"
}

const DEV = resolveDevFlag()

const defaultReporter: DiagnosticsReporter = (message, details) => {
  if (!DEV || typeof console === "undefined") {
    return
  }
  if (details) {
    console.warn(`[surface-core] ${message}`, details)
  } else {
    console.warn(`[surface-core] ${message}`)
  }
}

let reporter: DiagnosticsReporter = defaultReporter

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function emit(message: string, details?: Record<string, unknown>) {
  if (!DEV) {
    return
  }
  reporter(message, details)
}

export class SurfaceDiagnostics {
  static configure(customReporter?: DiagnosticsReporter) {
    reporter = customReporter ?? defaultReporter
  }

  static validateRect(rect: Rect | null | undefined, label: string) {
    if (!DEV) {
      return true
    }
    if (!rect) {
      emit(`${label} rect is missing`, { label })
      return false
    }
    const invalidFields: Partial<Record<RectKey, unknown>> = {}
    for (const key of ["x", "y", "width", "height"] as RectKey[]) {
      const value = rect[key]
      if (!isFiniteNumber(value)) {
        invalidFields[key] = value
      }
    }
    if (Object.keys(invalidFields).length > 0) {
      emit(`${label} rect has invalid numeric values`, { label, invalidFields })
      return false
    }
    if (rect.width < 0 || rect.height < 0) {
      emit(`${label} rect has negative dimensions`, { label, width: rect.width, height: rect.height })
      return false
    }
    return true
  }

  static validatePositionOptions(options?: PositionOptions) {
    if (!DEV || !options) {
      return true
    }
    let valid = true
    for (const field of ["gutter", "viewportPadding", "viewportWidth", "viewportHeight"] as const) {
      const value = options[field]
      if (value === undefined) {
        continue
      }
      if (!isFiniteNumber(value)) {
        emit(`Position option '${field}' must be a finite number`, { field, value })
        valid = false
        continue
      }
      if ((field === "viewportWidth" || field === "viewportHeight") && value <= 0) {
        emit(`Position option '${field}' must be greater than 0`, { field, value })
        valid = false
      }
      if ((field === "gutter" || field === "viewportPadding") && value < 0) {
        emit(`Position option '${field}' cannot be negative`, { field, value })
        valid = false
      }
    }
    return valid
  }

  static validatePositionArgs(anchor: Rect | null | undefined, surface: Rect | null | undefined, options?: PositionOptions) {
    if (!DEV) {
      return true
    }
    const anchorValid = this.validateRect(anchor, "anchor")
    const surfaceValid = this.validateRect(surface, "surface")
    if (surfaceValid && surface && (surface.width === 0 || surface.height === 0)) {
      emit("surface rect has zero width/height; positioning may collapse", {
        width: surface.width,
        height: surface.height,
      })
    }
    const optionsValid = this.validatePositionOptions(options)
    return anchorValid && surfaceValid && optionsValid
  }
}
