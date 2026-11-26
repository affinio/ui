import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

const packageRoot = process.cwd()

describe("native ESM package entry", () => {
  it("imports the built package in Node without experimental resolution flags", () => {
    const output = execFileSync(process.execPath, [
      "--input-type=module",
      "-e",
      "import { TabsCore } from '@affino/tabs-core'; const tabs = new TabsCore('settings'); tabs.select('document'); process.stdout.write(tabs.getSnapshot().value)",
    ], { cwd: packageRoot, encoding: "utf8" })

    expect(output).toBe("document")
  })
})
