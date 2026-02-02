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

type Cleanup = () => void

type TriggerEventHandlers = Pick<TooltipTriggerProps, "onPointerEnter" | "onPointerLeave" | "onFocus" | "onBlur">

const registry = new WeakMap<RootEl, Cleanup>()

export function bootstrapAffinoTooltips(): void {
	scan(document)
	setupMutationObserver()
	setupLivewireHooks()
}

export function hydrateTooltip(root: RootEl): void {
	if (registry.has(root)) {
		return
	}

	const trigger = root.querySelector<HTMLElement>("[data-affino-tooltip-trigger]")
	const surface = root.querySelector<HTMLElement>("[data-affino-tooltip-surface]")

	if (!trigger || !surface) {
		return
	}

	const triggerMode = resolveTriggerMode(root.dataset.affinoTooltipTriggerMode)

	const tooltip = new TooltipCore({
		id: root.dataset.affinoTooltipRoot,
		openDelay: readNumber(root.dataset.affinoTooltipOpenDelay, 80),
		closeDelay: readNumber(root.dataset.affinoTooltipCloseDelay, 150),
	})

	const detachments: Cleanup[] = []
	let pendingMeasureFrame: number | null = null

	const triggerProps = tooltip.getTriggerProps() as TooltipTriggerProps
	const triggerAttributes = stripTriggerEventHandlers(triggerProps)
	detachments.push(bindProps(trigger, triggerAttributes))
	const triggerEvents: TriggerEventHandlers = {
		onPointerEnter: triggerProps.onPointerEnter,
		onPointerLeave: triggerProps.onPointerLeave,
		onFocus: triggerProps.onFocus,
		onBlur: triggerProps.onBlur,
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
			requestAnimationFrame(updatePosition)
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

	registry.set(root, () => {
		detachments.forEach((cleanup) => cleanup())
		registry.delete(root)
	})
}

function bindProps(element: HTMLElement, props: Record<string, unknown>): Cleanup {
	const disposers: Cleanup[] = []

	for (const [key, value] of Object.entries(props)) {
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

function bindTriggerModeListeners(
	trigger: HTMLElement,
	mode: TriggerMode,
	events: TriggerEventHandlers,
	tooltip: TooltipCore,
): Cleanup {
	const disposers: Cleanup[] = []

	const add = (eventName: keyof HTMLElementEventMap, listener: EventListener) => {
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
			add("focus", focusHandler)
		}

		if (events.onBlur) {
			const blurHandler: EventListener = (event) => events.onBlur?.(event as FocusEvent)
			add("blur", blurHandler)
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
	})

	observer.observe(document.documentElement, {
		childList: true,
		subtree: true,
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

	document.addEventListener("livewire:navigated", () => scan(document))

	;(window as any).__affinoTooltipLivewireHooked = true
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
