import type {
  OverlayInteractionMatrixConfig,
  OverlayInteractionRule,
  OverlayInteractionTelemetryEvent,
  OverlayKind,
} from "../types.js"

const defaultRules: OverlayInteractionRule[] = [
  { source: "dialog", target: "dialog", allowStack: true, closeStrategy: "single" },
  { source: "sheet", target: "dialog", allowStack: false, closeStrategy: "cascade" },
  { source: "dialog", target: "sheet", allowStack: true, closeStrategy: "single" },
  { source: "sheet", target: "sheet", allowStack: true, closeStrategy: "cascade" },
]

type RuleKey = `${OverlayKind}->${OverlayKind}`

const ruleKey = (source: OverlayKind, target: OverlayKind): RuleKey => `${source}->${target}`

const mergeRules = (
  base: OverlayInteractionRule[],
  overrides?: OverlayInteractionRule[]
): OverlayInteractionRule[] => {
  if (!overrides?.length) {
    return base
  }
  const map = new Map<RuleKey, OverlayInteractionRule>()
  for (const rule of base) {
    map.set(ruleKey(rule.source, rule.target), rule)
  }
  for (const rule of overrides) {
    map.set(ruleKey(rule.source, rule.target), rule)
  }
  return Array.from(map.values())
}

export class OverlayInteractionMatrix {
  private readonly ruleMap: Map<RuleKey, OverlayInteractionRule>
  private readonly rules: OverlayInteractionRule[]
  private readonly telemetryEmit?: (event: OverlayInteractionTelemetryEvent) => void

  constructor(config?: OverlayInteractionMatrixConfig) {
    const mergedRules = mergeRules(defaultRules, config?.rules)
    this.ruleMap = new Map<RuleKey, OverlayInteractionRule>()
    for (const rule of mergedRules) {
      this.ruleMap.set(ruleKey(rule.source, rule.target), rule)
    }
    this.rules = Array.from(this.ruleMap.values())
    this.telemetryEmit = config?.telemetry?.emit
  }

  canStack(source: OverlayKind, target: OverlayKind): boolean {
    const rule = this.lookup(source, target)
    const allowStack = rule?.allowStack ?? source === target
    this.emit({ type: "stack-decision", source, target, allowed: allowStack, rule })
    return allowStack
  }

  closeStrategy(source: OverlayKind, target: OverlayKind): "cascade" | "single" {
    const rule = this.lookup(source, target)
    const strategy = rule?.closeStrategy ?? "single"
    this.emit({ type: "close-decision", source, target, strategy, rule })
    return strategy
  }

  getRules(): OverlayInteractionRule[] {
    return [...this.rules]
  }

  private lookup(source: OverlayKind, target: OverlayKind): OverlayInteractionRule | undefined {
    return this.ruleMap.get(ruleKey(source, target))
  }

  private emit(event: OverlayInteractionTelemetryEvent): void {
    this.telemetryEmit?.(event)
  }
}

export const createOverlayInteractionMatrix = (config?: OverlayInteractionMatrixConfig) =>
  new OverlayInteractionMatrix(config)
