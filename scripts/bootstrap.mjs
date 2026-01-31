#!/usr/bin/env node
import { spawn } from "node:child_process"

const steps = [
  {
    title: "Install workspace dependencies",
    command: "pnpm",
    args: ["install"],
  },
  {
    title: "Rebuild core packages",
    command: "pnpm",
    args: ["run", "build"],
  },
  {
    title: "Run type checks",
    command: "pnpm",
    args: ["run", "type-check"],
  },
]

async function run() {
  for (const step of steps) {
    await runStep(step)
  }
  console.log("\n✅ Workspace bootstrapped. You're ready to code!")
}

function runStep({ title, command, args }) {
  console.log(`\n▶ ${title}`)
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: true })
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${title} failed with code ${code}`))
        return
      }
      resolve()
    })
  })
}

run().catch((error) => {
  console.error("\n❌ Bootstrap failed")
  console.error(error)
  process.exit(1)
})
