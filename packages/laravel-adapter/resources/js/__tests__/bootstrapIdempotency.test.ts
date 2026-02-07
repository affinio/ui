import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const diagnosticsExpose = vi.fn()
  return {
    bootstrapDialogs: vi.fn(),
    bootstrapTooltips: vi.fn(),
    bootstrapPopovers: vi.fn(),
    bootstrapListboxes: vi.fn(),
    bootstrapComboboxes: vi.fn(),
    bootstrapMenus: vi.fn(),
    bootstrapTabs: vi.fn(),
    bootstrapTreeviews: vi.fn(),
    bootstrapDisclosure: vi.fn(),
    bindManualBridge: vi.fn(),
    registerScrollGuards: vi.fn(),
    createDiagnosticsRuntime: vi.fn(() => ({ expose: diagnosticsExpose })),
    bindLivewireActionBridge: vi.fn(),
    getDocumentOverlayManager: vi.fn(() => ({ id: "overlay-manager" })),
    diagnosticsExpose,
  }
})

vi.mock("@affino/dialog-laravel", () => ({ bootstrapAffinoDialogs: mocks.bootstrapDialogs }))
vi.mock("@affino/tooltip-laravel", () => ({ bootstrapAffinoTooltips: mocks.bootstrapTooltips }))
vi.mock("@affino/popover-laravel", () => ({ bootstrapAffinoPopovers: mocks.bootstrapPopovers }))
vi.mock("@affino/listbox-laravel", () => ({ bootstrapAffinoListboxes: mocks.bootstrapListboxes }))
vi.mock("@affino/combobox-laravel", () => ({ bootstrapAffinoComboboxes: mocks.bootstrapComboboxes }))
vi.mock("@affino/menu-laravel", () => ({ bootstrapAffinoMenus: mocks.bootstrapMenus }))
vi.mock("@affino/tabs-laravel", () => ({ bootstrapAffinoTabs: mocks.bootstrapTabs }))
vi.mock("@affino/treeview-laravel", () => ({ bootstrapAffinoTreeviews: mocks.bootstrapTreeviews }))
vi.mock("@affino/disclosure-laravel", () => ({ bootstrapAffinoDisclosure: mocks.bootstrapDisclosure }))
vi.mock("@affino/overlay-kernel", () => ({ getDocumentOverlayManager: mocks.getDocumentOverlayManager }))

vi.mock("../internal/manualBridge", () => ({ bindManualBridge: mocks.bindManualBridge }))
vi.mock("../internal/scrollGuards", () => ({ registerScrollGuards: mocks.registerScrollGuards }))
vi.mock("../internal/diagnostics", () => ({ createDiagnosticsRuntime: mocks.createDiagnosticsRuntime }))
vi.mock("../internal/livewireActionBridge", () => ({
  bindLivewireActionBridge: mocks.bindLivewireActionBridge,
}))

describe("laravel-adapter bootstrap idempotency", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    delete (window as any).__affinoLaravelAdapterBootstrapped
    delete (window as any).__affinoOverlayManager
    delete (window as any).__affinoLaravelDiagnostics
  })

  it("boots all adapters only once per window", async () => {
    const { bootstrapAffinoLaravelAdapters } = await import("../index")

    bootstrapAffinoLaravelAdapters()
    bootstrapAffinoLaravelAdapters()

    expect(mocks.bootstrapDialogs).toHaveBeenCalledTimes(1)
    expect(mocks.bootstrapTooltips).toHaveBeenCalledTimes(1)
    expect(mocks.bootstrapPopovers).toHaveBeenCalledTimes(1)
    expect(mocks.bootstrapListboxes).toHaveBeenCalledTimes(1)
    expect(mocks.bootstrapComboboxes).toHaveBeenCalledTimes(1)
    expect(mocks.bootstrapMenus).toHaveBeenCalledTimes(1)
    expect(mocks.bootstrapTabs).toHaveBeenCalledTimes(1)
    expect(mocks.bootstrapTreeviews).toHaveBeenCalledTimes(1)
    expect(mocks.bootstrapDisclosure).toHaveBeenCalledTimes(1)
    expect(mocks.bindLivewireActionBridge).toHaveBeenCalledTimes(1)
    expect(mocks.bindManualBridge).toHaveBeenCalledTimes(9)
    expect(mocks.registerScrollGuards).toHaveBeenCalledTimes(1)
  })

  it("does not register scroll guards when disabled", async () => {
    const { bootstrapAffinoLaravelAdapters } = await import("../index")
    bootstrapAffinoLaravelAdapters({ registerScrollGuards: false })

    expect(mocks.registerScrollGuards).not.toHaveBeenCalled()
  })

  it("initializes diagnostics runtime once when enabled", async () => {
    const { bootstrapAffinoLaravelAdapters } = await import("../index")

    bootstrapAffinoLaravelAdapters({ diagnostics: true })
    bootstrapAffinoLaravelAdapters({ diagnostics: true })

    expect(mocks.createDiagnosticsRuntime).toHaveBeenCalledTimes(1)
    expect(mocks.diagnosticsExpose).toHaveBeenCalledTimes(1)
  })
})
