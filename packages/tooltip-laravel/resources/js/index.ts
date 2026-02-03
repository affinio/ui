import { TooltipCore } from "@affino/tooltip-core"
import type { TooltipTriggerProps, TooltipState, TooltipReason } from "@affino/tooltip-core"

type TooltipHandle = {
	open: (reason?: TooltipReason) => void
	close: (reason?: TooltipReason) => void
	toggle: (reason?: TooltipReason) => void
	getSnapshot: () => TooltipState
}

type TriggerMode = "hover" | "focus" | "hover-focus" | "click" | "manual"

const DEFAULT_TRIGGER_MODE: TriggerMode = "hover-focus"

const ALLOWED_TRIGGER_MODES = new Set<TriggerMode>(["hover", "focus", "hover-focus", "click", "manual"])

let activeTooltipRoot: RootEl | null = null
let pointerGuardsBound = false
const focusedTooltipIds = new Set<string>()
;(window as any).__affinoTooltipFocused = focusedTooltipIds
const focusRestorers = new Map<string, () => void>()
;(window as any).__affinoFocusRestorers = focusRestorers
let pendingFocusSync = false
let pointerIntentBound = false
let lastExternalPointerDown = 0
const POINTER_INTENT_WINDOW_MS = 300
const FOCUSABLE_WITHIN_SELECTOR = [
	'[data-affino-tooltip-focus-target]',
	'input:not([disabled])',
	'textarea:not([disabled])',
	'select:not([disabled])',
	'button:not([disabled])',
	'a[href]',
	'[tabindex]:not([tabindex="-1"])',
	'[contenteditable="true"]',
	'[contenteditable=""]',
].join(',')

type RootEl = HTMLElement & {
	dataset: DOMStringMap & {
		affinoTooltipRoot?: string
		affinoTooltipPlacement?: string
		affinoTooltipAlign?: string
		affinoTooltipGutter?: string
		affinoTooltipStrategy?: string
		affinoTooltipOpenDelay?: string
		affinoTooltipCloseDelay?: string
		affinoTooltipTriggerMode?: string
	}
	affinoTooltip?: TooltipHandle
}

type Cleanup = (options?: { releaseFocus?: boolean }) => void

type TriggerEventHandlers = Pick<TooltipTriggerProps, "onPointerEnter" | "onPointerLeave" | "onFocus" | "onBlur">

const registry = new WeakMap<RootEl, Cleanup>()

export function bootstrapAffinoTooltips(): void {
	scan(document)
	setupMutationObserver()
	setupLivewireHooks()
	setupPointerGuards()
	setupPointerIntentTracker()
}

export function hydrateTooltip(root: RootEl): void {
	const resolveTriggerElement = () => root.querySelector<HTMLElement>("[data-affino-tooltip-trigger]")
	const resolveSurfaceElement = () => root.querySelector<HTMLElement>("[data-affino-tooltip-surface]")
	const trigger = resolveTriggerElement()
	const surface = resolveSurfaceElement()

	if (!trigger || !surface) {
		return
	}

	const teardown = registry.get(root)
	if (teardown) {
		teardown({ releaseFocus: false })
	}

	const rootId = root.dataset.affinoTooltipRoot ?? null
	const triggerMode = resolveTriggerMode(root.dataset.affinoTooltipTriggerMode)
	const shouldSyncFocus = isFocusMode(triggerMode)

	const tooltip = new TooltipCore({
		id: root.dataset.affinoTooltipRoot,
		openDelay: readNumber(root.dataset.affinoTooltipOpenDelay, 80),
		closeDelay: readNumber(root.dataset.affinoTooltipCloseDelay, 150),
	})

	const detachments: Cleanup[] = []
	let pendingMeasureFrame: number | null = null

	const triggerProps = tooltip.getTriggerProps({
		tabIndex: trigger.hasAttribute("tabindex") ? trigger.tabIndex : undefined,
	}) as TooltipTriggerProps
	const triggerAttributes = stripTriggerEventHandlers(triggerProps)
	detachments.push(bindProps(trigger, triggerAttributes))
	const triggerEvents: TriggerEventHandlers = {
		onPointerEnter: triggerProps.onPointerEnter,
		onPointerLeave: triggerProps.onPointerLeave,
		onFocus: (event) => {
			if (shouldSyncFocus && rootId) {
				focusedTooltipIds.add(rootId)
			}
			triggerProps.onFocus?.(event)
		},
			onBlur: (event) => {
			if (rootId) {
				const hasExplicitTarget = event.relatedTarget instanceof HTMLElement
				const pointerInitiated = performance.now() - lastExternalPointerDown < POINTER_INTENT_WINDOW_MS
				requestAnimationFrame(() => {
					const shouldRelease = hasExplicitTarget || pointerInitiated
					if (shouldRelease && trigger.isConnected) {
						focusedTooltipIds.delete(rootId)
					}
				})
			}
			triggerProps.onBlur?.(event)
		},
	}
	detachments.push(bindTriggerModeListeners(trigger, triggerMode, triggerEvents, tooltip))
	detachments.push(attachTooltipHandle(root, tooltip))
	const tooltipProps = tooltip.getTooltipProps() as unknown as Record<string, unknown>
	bindTooltipProps(surface, tooltipProps)

	const updatePosition = () => {
		const anchorRect = trigger.getBoundingClientRect()
		const tooltipRect = surface.getBoundingClientRect()
		if (tooltipRect.width === 0 || tooltipRect.height === 0) {
			if (pendingMeasureFrame === null) {
				pendingMeasureFrame = requestAnimationFrame(() => {
					pendingMeasureFrame = null
					if (!surface.hidden) {
						updatePosition()
					}
				})
			}
			return
		}
		const position = tooltip.computePosition(anchorRect, tooltipRect, {
			placement: (root.dataset.affinoTooltipPlacement as any) ?? "top",
			align: (root.dataset.affinoTooltipAlign as any) ?? "center",
			gutter: readNumber(root.dataset.affinoTooltipGutter, 8),
		})

		surface.style.position = (root.dataset.affinoTooltipStrategy as CSSPosition) ?? "fixed"
		surface.style.left = `${position.left}px`
		surface.style.top = `${position.top}px`
		surface.style.transform = ""
		surface.dataset.placement = position.placement
		surface.dataset.align = position.align
	}

	const unsubscribe = tooltip.subscribe((snapshot: TooltipState) => {
		const state = snapshot.open ? "open" : "closed"
		root.dataset.affinoTooltipState = state
		surface.dataset.state = state
		surface.hidden = !snapshot.open

		if (snapshot.open) {
			ensureSingleActiveTooltip(root)
			requestAnimationFrame(updatePosition)
		} else if (activeTooltipRoot === root) {
			activeTooltipRoot = null
		}
	})

	detachments.push(() => unsubscribe.unsubscribe())

	const resizeObserver = new ResizeObserver(() => {
		if (!surface.hidden) {
			updatePosition()
		}
	})

	resizeObserver.observe(trigger)
	detachments.push(() => {
		resizeObserver.disconnect()
		if (pendingMeasureFrame !== null) {
			cancelAnimationFrame(pendingMeasureFrame)
			pendingMeasureFrame = null
		}
	})

	let pendingStructureRehydrate = false
	const scheduleStructureRehydrate = () => {
		if (pendingStructureRehydrate) {
			return
		}
		pendingStructureRehydrate = true
		Promise.resolve().then(() => {
			pendingStructureRehydrate = false
			hydrateTooltip(root)
		})
	}

	const structureObserver = new MutationObserver(() => {
		const nextTrigger = resolveTriggerElement()
		const nextSurface = resolveSurfaceElement()
		if (nextTrigger !== trigger || nextSurface !== surface) {
			scheduleStructureRehydrate()
		}
	})

	structureObserver.observe(root, { childList: true, subtree: true })
	detachments.push(() => structureObserver.disconnect())

	const restoreTrackedFocus = () => {
		if (!shouldSyncFocus || !rootId) {
			return
		}

		if (!root.isConnected) {
			focusRestorers.delete(rootId)
			focusedTooltipIds.delete(rootId)
			return
		}

		const currentTrigger = resolveTriggerElement()
		if (!currentTrigger || document.activeElement === currentTrigger) {
			const log = (window as any).__affinoRestoreLog ?? []
			log.push({ id: rootId, reason: !currentTrigger ? "missing-trigger" : "already-focused" })
			;(window as any).__affinoRestoreLog = log
			return
		}

		const focusTarget = resolveFocusableTarget(currentTrigger)
		if (!focusTarget) {
			const log = (window as any).__affinoRestoreLog ?? []
			log.push({ id: rootId, reason: "no-focus-target" })
			;(window as any).__affinoRestoreLog = log
			return
		}

		const log = (window as any).__affinoRestoreLog ?? []
		const beforeTag = document.activeElement?.tagName
		const isConnected = focusTarget.isConnected
		focusTarget.focus({ preventScroll: true })
		const afterFocusTag = document.activeElement?.tagName
		log.push({ id: rootId, reason: "refocusing", beforeTag, afterFocusTag, isConnected, focusTarget: focusTarget.tagName })
		;(window as any).__affinoRestoreLog = log
		triggerProps.onFocus?.(new FocusEvent("focus"))
	}

	const hasTrackedFocus = shouldSyncFocus && rootId != null && focusedTooltipIds.has(rootId)
	const alreadyFocused = shouldSyncFocus && document.activeElement === trigger
	if (shouldSyncFocus && (hasTrackedFocus || alreadyFocused)) {
		requestAnimationFrame(() => {
			if (hasTrackedFocus && document.activeElement !== trigger) {
				restoreTrackedFocus()
				return
			}
			triggerProps.onFocus?.(new FocusEvent("focus"))
		})
	}

	if (rootId && shouldSyncFocus) {
		focusRestorers.set(rootId, restoreTrackedFocus)
		const global = window as any
		global.__affinoRestorerSetCount = (global.__affinoRestorerSetCount ?? 0) + 1
	}

	registry.set(root, (options = {}) => {
		const releaseFocus = options.releaseFocus !== false
		if (activeTooltipRoot === root) {
			closeTooltipRoot(root, "programmatic")
		}
		detachments.forEach((cleanup) => cleanup())
		if (rootId) {
			if (releaseFocus) {
				focusedTooltipIds.delete(rootId)
			}
			focusRestorers.delete(rootId)
		}
		registry.delete(root)
	})
}

type DisableableElement = HTMLElement & { disabled: boolean }

function isDisableableElement(element: HTMLElement): element is DisableableElement {
	return "disabled" in element
}

function isFocusableElement(element: HTMLElement | null): boolean {
	if (!element) {
		return false
	}

	if (isDisableableElement(element) && element.disabled) {
		return false
	}

	if (element.tabIndex >= 0) {
		return true
	}

	return element.isContentEditable
}

function resolveFocusableTarget(trigger: HTMLElement | null): HTMLElement | null {
	if (!trigger) {
		return null
	}

	const descendant = trigger.querySelector<HTMLElement>(FOCUSABLE_WITHIN_SELECTOR)
	if (descendant && isFocusableElement(descendant)) {
		return descendant
	}

	return isFocusableElement(trigger) ? trigger : null
}

function bindProps(element: HTMLElement, props: Record<string, unknown>): Cleanup {
	const disposers: Cleanup[] = []

	for (const [key, value] of Object.entries(props)) {
		if (key === "tabIndex") {
			if (value == null) {
				element.removeAttribute("tabindex")
			} else {
				element.setAttribute("tabindex", String(value))
			}
			continue
		}

		if (key.startsWith("on") && typeof value === "function") {
			const eventName = key.slice(2).toLowerCase()
			const handler = value as EventListener
			element.addEventListener(eventName, handler as EventListener)
			disposers.push(() => element.removeEventListener(eventName, handler as EventListener))
			continue
		}

		if (value == null) {
			continue
		}

		if (typeof value === "boolean") {
			if (value) {
				element.setAttribute(toKebabCase(key), "")
			} else {
				element.removeAttribute(toKebabCase(key))
			}
			continue
		}

		element.setAttribute(toKebabCase(key), String(value))
	}

	return () => disposers.forEach((dispose) => dispose())
}

function bindTooltipProps(element: HTMLElement, props: Record<string, unknown>): void {
	for (const [key, value] of Object.entries(props)) {
		if (value == null) {
			continue
		}

		if (typeof value === "boolean") {
			if (value) {
				element.setAttribute(toKebabCase(key), "")
			} else {
				element.removeAttribute(toKebabCase(key))
			}
			continue
		}

		element.setAttribute(toKebabCase(key), String(value))
	}
}

function stripTriggerEventHandlers(props: TooltipTriggerProps): Record<string, unknown> {
	const attributes: Record<string, unknown> = { ...props }
	delete attributes.onPointerEnter
	delete attributes.onPointerLeave
	delete attributes.onFocus
	delete attributes.onBlur
	return attributes
}

function resolveTriggerMode(value?: string): TriggerMode {
	if (!value) {
		return DEFAULT_TRIGGER_MODE
	}

	const normalized = value.toLowerCase() as TriggerMode
	return ALLOWED_TRIGGER_MODES.has(normalized) ? normalized : DEFAULT_TRIGGER_MODE
}

type TriggerListenerEvent = keyof HTMLElementEventMap | "focusin" | "focusout"

function bindTriggerModeListeners(
	trigger: HTMLElement,
	mode: TriggerMode,
	events: TriggerEventHandlers,
	tooltip: TooltipCore,
): Cleanup {
	const disposers: Cleanup[] = []

	const add = (eventName: TriggerListenerEvent, listener: EventListener) => {
		trigger.addEventListener(eventName, listener)
		disposers.push(() => trigger.removeEventListener(eventName, listener))
	}

	if (mode === "hover" || mode === "hover-focus") {
		if (events.onPointerEnter) {
			const hoverEnter: EventListener = (event) => events.onPointerEnter?.(event as unknown as PointerEvent)
			add("mouseenter", hoverEnter)
		}

		if (events.onPointerLeave) {
			const hoverLeave: EventListener = (event) => events.onPointerLeave?.(event as unknown as PointerEvent)
			add("mouseleave", hoverLeave)
		}
	}

	if (mode === "focus" || mode === "hover-focus") {
		if (events.onFocus) {
			const focusHandler: EventListener = (event) => events.onFocus?.(event as FocusEvent)
			add("focusin", focusHandler)
		}

		if (events.onBlur) {
			const blurHandler: EventListener = (event) => events.onBlur?.(event as FocusEvent)
			add("focusout", blurHandler)
		}
	}

	if (mode === "click") {
		const handleClick = () => {
			if (tooltip.getSnapshot().open) {
				tooltip.close("pointer")
			} else {
				tooltip.open("pointer")
			}
		}
		add("click", handleClick)
	}

	return () => {
		disposers.forEach((dispose) => dispose())
	}
}

function attachTooltipHandle(root: RootEl, tooltip: TooltipCore): Cleanup {
	const handle: TooltipHandle = {
		open: (reason = "programmatic") => tooltip.open(reason),
		close: (reason = "programmatic") => tooltip.close(reason),
		toggle: () => tooltip.toggle(),
		getSnapshot: () => tooltip.getSnapshot(),
	}

	root.affinoTooltip = handle

	return () => {
		if (root.affinoTooltip === handle) {
			delete root.affinoTooltip
		}
	}
}

function ensureSingleActiveTooltip(nextRoot: RootEl) {
	if (activeTooltipRoot && activeTooltipRoot !== nextRoot) {
		closeTooltipRoot(activeTooltipRoot, "programmatic")
	}
	activeTooltipRoot = nextRoot
}

function closeTooltipRoot(root: RootEl, reason: TooltipReason = "programmatic") {
	const handle = root.affinoTooltip
	if (handle) {
		handle.close(reason)
	}
	if (activeTooltipRoot === root) {
		activeTooltipRoot = null
	}
}

function scan(root: ParentNode): void {
	const nodes = root.querySelectorAll<RootEl>("[data-affino-tooltip-root]")
	nodes.forEach((node) => hydrateTooltip(node))
}

function setupMutationObserver(): void {
	if ((window as any).__affinoTooltipObserver) {
		return
	}

	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			mutation.addedNodes.forEach((node) => {
				if (node instanceof HTMLElement || node instanceof DocumentFragment) {
					scan(node)
				}
			})
		})

		if (focusedTooltipIds.size > 0) {
			scheduleFocusSync()
		}
	})

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
		characterData: true,
	})

	;(window as any).__affinoTooltipObserver = observer
}

function setupLivewireHooks(): void {
	const livewire = (window as any).Livewire

	if (!livewire || (window as any).__affinoTooltipLivewireHooked) {
		return
	}

	if (typeof livewire.hook === "function") {
		livewire.hook("morph.added", ({ el }: { el: Element }) => {
			if (el instanceof HTMLElement || el instanceof DocumentFragment) {
				scan(el)
			}
		})
	}

	document.addEventListener("livewire:navigated", () => {
		focusedTooltipIds.clear()
		scan(document)
		const global = window as any
		global.__affinoNavigatedCount = (global.__affinoNavigatedCount ?? 0) + 1
	})

	;(window as any).__affinoTooltipLivewireHooked = true
}

function setupPointerGuards(): void {
	if (pointerGuardsBound) {
		return
	}

	const handlePointerMove = (event: PointerEvent) => {
		if (!activeTooltipRoot) {
			return
		}

		const target = event.target
		if (target instanceof Element) {
			const owningRoot = target.closest<RootEl>("[data-affino-tooltip-root]")
			if (owningRoot && owningRoot === activeTooltipRoot) {
				return
			}
		}

		maybeCloseActiveTooltip("pointer")
	}

	const handleDocumentLeave = () => {
		maybeCloseActiveTooltip("pointer")
	}

	document.addEventListener("pointermove", handlePointerMove, { passive: true })
	document.addEventListener("mouseleave", handleDocumentLeave)
	window.addEventListener("blur", handleDocumentLeave)

	pointerGuardsBound = true
}

function maybeCloseActiveTooltip(reason: TooltipReason) {
	if (!activeTooltipRoot) {
		return
	}

	if (shouldSkipPointerGuard(activeTooltipRoot)) {
		return
	}

	const activeElement = document.activeElement
	if (activeElement instanceof Element && activeTooltipRoot.contains(activeElement)) {
		return
	}

	closeTooltipRoot(activeTooltipRoot, reason)
}

function shouldSkipPointerGuard(root: RootEl): boolean {
	const mode = resolveTriggerMode(root.dataset.affinoTooltipTriggerMode)
	return mode === "manual" || mode === "click" || mode === "focus"
}

function setupPointerIntentTracker(): void {
	if (pointerIntentBound) {
		return
	}

	const recordPointerDown = (event: PointerEvent) => {
		const target = event.target
		if (target instanceof Element) {
			const owningRoot = target.closest<RootEl>("[data-affino-tooltip-root]")
			if (owningRoot) {
				const id = owningRoot.dataset.affinoTooltipRoot
				if (id && focusedTooltipIds.has(id)) {
					return
				}
			}
		}

		lastExternalPointerDown = performance.now()
	}

	document.addEventListener("pointerdown", recordPointerDown, true)
	pointerIntentBound = true
}

function isFocusMode(mode: TriggerMode): boolean {
	return mode === "focus" || mode === "hover-focus"
}

function scheduleFocusSync(): void {
	if (pendingFocusSync) {
		return
	}

	pendingFocusSync = true
	requestAnimationFrame(() => {
		pendingFocusSync = false
		syncTrackedFocus()
	})
}

function syncTrackedFocus(): void {
	focusedTooltipIds.forEach((id) => {
		const restore = focusRestorers.get(id)
		restore?.()
	})
	const global = window as any
	global.__affinoFocusSyncCount = (global.__affinoFocusSyncCount ?? 0) + 1
}

function readNumber(value: string | undefined, fallback: number): number {
	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : fallback
}

function toKebabCase(key: string): string {
	return key
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/_/g, "-")
		.toLowerCase()
}

type CSSPosition = Extract<CSSStyleDeclaration["position"], "fixed" | "absolute">
