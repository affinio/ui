import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

describe("native ESM package entry", () => {
  it("imports the built Vue package and its Core dependency in Node", () => {
    const output = execFileSync(process.execPath, [
      "--input-type=module",
      "-e",
      "import { UiWorkspaceTabs, useTabsController } from '@affino/tabs-vue'; if (typeof UiWorkspaceTabs !== 'object' || typeof useTabsController !== 'function') process.exit(1); process.stdout.write('ok')",
    ], { cwd: process.cwd(), encoding: "utf8" })

    expect(output).toBe("ok")
  })
})
