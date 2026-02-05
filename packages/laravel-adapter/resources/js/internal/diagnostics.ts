import type { AffinoAdapterComponent } from "../contracts"

type ComponentDescriptor = {
  name: AffinoAdapterComponent
  selector: string
  handleProperty: string
}

type ManualCounters = Record<AffinoAdapterComponent, number>

export type DiagnosticsSnapshot = {
  hydratedCounts: Readonly<Record<AffinoAdapterComponent, number>>
  skippedCounts: Readonly<Record<AffinoAdapterComponent, number>>
  manualInvocations: Readonly<ManualCounters>
}

export type DiagnosticsRuntime = {
  recordManualInvocation: (component: AffinoAdapterComponent) => void
  getSnapshot: () => DiagnosticsSnapshot
  expose: () => void
}

export function createDiagnosticsRuntime(
  descriptors: readonly ComponentDescriptor[],
): DiagnosticsRuntime {
  const manualCounts: ManualCounters = createZeroRecord()
  let exposed = false

  const recordManualInvocation = (component: AffinoAdapterComponent) => {
    manualCounts[component] = (manualCounts[component] ?? 0) + 1
  }

  const getSnapshot = (): DiagnosticsSnapshot => {
    const { hydratedCounts, skippedCounts } = collectHydrationCounts(descriptors)
    return Object.freeze({
      hydratedCounts,
      skippedCounts,
      manualInvocations: Object.freeze({ ...manualCounts }),
    })
  }

  const expose = () => {
    if (exposed || typeof window === "undefined") {
      return
    }
    try {
      Object.defineProperty(window as unknown as Record<string, unknown>, "__affinoLaravelDiagnostics", {
        value: Object.freeze({
          get snapshot() {
            return getSnapshot()
          },
        }),
        configurable: true,
        enumerable: false,
        writable: false,
      })
      exposed = true
    } catch {
      // no-op: diagnostics stay local if globals cannot be defined
    }
  }

  return { recordManualInvocation, getSnapshot, expose }
}

function collectHydrationCounts(descriptors: readonly ComponentDescriptor[]) {
  const hydratedCounts = createZeroRecord()
  const skippedCounts = createZeroRecord()
  if (typeof document === "undefined") {
    return { hydratedCounts, skippedCounts }
  }

  descriptors.forEach((descriptor) => {
    let hydrated = 0
    let skipped = 0
    document.querySelectorAll<HTMLElement>(descriptor.selector).forEach((root) => {
      const handle = (root as HTMLElement & Record<string, unknown>)[descriptor.handleProperty]
      if (handle) {
        hydrated += 1
      } else {
        skipped += 1
      }
    })
    hydratedCounts[descriptor.name] = hydrated
    skippedCounts[descriptor.name] = skipped
  })

  return {
    hydratedCounts: Object.freeze(hydratedCounts),
    skippedCounts: Object.freeze(skippedCounts),
  }
}

function createZeroRecord(): ManualCounters {
  return {
    dialog: 0,
    tooltip: 0,
    popover: 0,
    menu: 0,
    listbox: 0,
    combobox: 0,
    tabs: 0,
    disclosure: 0,
  }
}
