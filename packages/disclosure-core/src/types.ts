export type DisclosureState = {
  open: boolean
}

export type DisclosureSnapshot = Readonly<DisclosureState>

export type DisclosureSubscriber = (state: DisclosureSnapshot) => void
