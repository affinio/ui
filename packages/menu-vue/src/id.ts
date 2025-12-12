let counter = 0

export function uid(prefix = "ui-menu") {
  counter += 1
  return `${prefix}-${counter}`
}
