export type TabsState<Value = string> = {
  value: Value | null
}

export type TabsSnapshot<Value = string> = Readonly<TabsState<Value>>

export type TabsSubscriber<Value = string> = (state: TabsSnapshot<Value>) => void
