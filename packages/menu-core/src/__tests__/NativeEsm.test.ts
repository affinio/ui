import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const packageRoot = fileURLToPath(new URL("../../", import.meta.url))

describe("native ESM package entry", () => {
  it("loads through the public package entry with Node resolution", () => {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", "await import('@affino/menu-core')"],
      { cwd: packageRoot, encoding: "utf8" },
    )

    expect(result.status, result.stderr).toBe(0)
  })
})
