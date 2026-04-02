export interface AccountOption {
  id: string
  name: string
  owner: string
  region: string
  status: "active" | "trial" | "churn-risk"
  plan: string
}

export const accountOptions: AccountOption[] = [
  { id: "starlight", name: "Starlight Analytics", owner: "R. Chen", region: "Toronto", status: "active", plan: "Enterprise" },
  { id: "northwind", name: "Northwind Ops", owner: "M. Ortega", region: "New York", status: "trial", plan: "Growth" },
  { id: "lumina", name: "Lumina Energy", owner: "J. Patel", region: "Austin", status: "active", plan: "Scale" },
  { id: "arbor", name: "Arbor Health", owner: "S. Ito", region: "Seattle", status: "churn-risk", plan: "Growth" },
  { id: "monocle", name: "Monocle Finance", owner: "L. Bryant", region: "Chicago", status: "active", plan: "Enterprise" },
  { id: "polar", name: "Polar Manufacturing", owner: "E. Miron", region: "Montreal", status: "trial", plan: "Startup" },
  { id: "petal", name: "Petal Studio", owner: "H. Delgado", region: "Lisbon", status: "active", plan: "Scale" },
  { id: "lineage", name: "Lineage Freight", owner: "D. Vance", region: "Atlanta", status: "churn-risk", plan: "Enterprise" },
  { id: "aster", name: "Aster Security", owner: "C. Nwosu", region: "Denver", status: "active", plan: "Scale" },
  { id: "helios", name: "Helios Robotics", owner: "I. Becker", region: "Berlin", status: "trial", plan: "Growth" },
  { id: "marlin", name: "Marlin Commerce", owner: "P. Ahmed", region: "Dubai", status: "active", plan: "Enterprise" },
  { id: "solis", name: "Solis Mobility", owner: "G. Laurent", region: "Paris", status: "active", plan: "Scale" },
]

export interface SegmentOption {
  id: string
  label: string
  description: string
  metric: string
}

export const segmentOptions: SegmentOption[] = [
  { id: "vip", label: "VIP revenue", description: "MRR > $50k", metric: "+18% QoQ" },
  { id: "adoption", label: "Adoption lag", description: "No key action in 14d", metric: "24 accounts" },
  { id: "champions", label: "Product champions", description: "NPS ≥ 9", metric: "112 leads" },
  { id: "markets", label: "New markets", description: "Launched < 90d", metric: "6 regions" },
  { id: "expansion", label: "Expansion ready", description: ">5 seats idle", metric: "74 accounts" },
  { id: "agency", label: "Agency partner", description: "Certified channel", metric: "31 studios" },
  { id: "pilot", label: "Pilot cohort", description: "In guided rollouts", metric: "12 teams" },
]
