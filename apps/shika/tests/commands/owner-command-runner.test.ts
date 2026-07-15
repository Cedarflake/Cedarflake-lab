import assert from "node:assert/strict"
import { describe, it } from "node:test"

import type { OwnerIdentity } from "../../src/lib/auth/owner-account"
import { createOwnerCommandRunner } from "../../src/lib/commands/owner-command-runner"

const owner: OwnerIdentity = {
  userId: "auth-user-1",
  githubOwnerId: "1",
  ownerKey: "github:1",
}

describe("owner command runner", () => {
  it("authorizes before invoking a command kernel", async () => {
    const order: string[] = []
    const run = createOwnerCommandRunner({
      authorize: async () => {
        order.push("authorize")
        return owner
      },
      execute: async (authorizedOwner, input: string) => {
        order.push("execute")
        assert.equal(authorizedOwner, owner)
        return input.toUpperCase()
      },
    })

    assert.equal(await run("ready"), "READY")
    assert.deepEqual(order, ["authorize", "execute"])
  })

  it("does not execute when authorization fails", async () => {
    let didExecute = false
    const run = createOwnerCommandRunner({
      authorize: async () => {
        throw new Error("unauthorized")
      },
      execute: async () => {
        didExecute = true
      },
    })

    await assert.rejects(run(undefined), /unauthorized/)
    assert.equal(didExecute, false)
  })
})
