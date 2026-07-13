import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { validateWorkflowContract } from "./workflowContract.ts"

async function createRepository(
  workflows: Readonly<Record<string, string>>,
): Promise<string> {
  const repositoryRoot = await mkdtemp(
    join(tmpdir(), "cedarflake-workflow-contract-"),
  )
  const workflowsPath = join(repositoryRoot, ".github", "workflows")

  await mkdir(workflowsPath, { recursive: true })
  await Promise.all(
    Object.entries(workflows).map(([filename, source]) =>
      writeFile(join(workflowsPath, filename), source, "utf8"),
    ),
  )

  return repositoryRoot
}

test("accepts scoped workflows with static self paths", async (context) => {
  const repositoryRoot = await createRepository({
    "project-demo-ci.yml": `name: "[Project] Demo CI"
on:
  workflow_dispatch:
  pull_request:
    paths:
      - "apps/demo/**"
      - ".github/workflows/project-demo-ci.yml"
  push:
    paths:
      - "apps/demo/**"
      - ".github/workflows/project-demo-ci.yml"
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: "true"
`,
    "repo-codeql-security.yml": `name: "[Repo] CodeQL Security"
on: [push, pull_request]
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - run: "true"
`,
  })

  context.after(() => rm(repositoryRoot, { force: true, recursive: true }))

  const result = await validateWorkflowContract(repositoryRoot)

  assert.deepEqual(result, {
    summary: { workflowCount: 2 },
    violations: [],
  })
})

test("aggregates filename, prefix, YAML, and self-path violations", async (context) => {
  const repositoryRoot = await createRepository({
    "project-broken-ci.yml": `name: "[Project] Broken CI"
on: [push
`,
    "project-demo-checks.yml": `name: "[Project] Demo Checks"
on: workflow_dispatch
jobs:
  check:
    runs-on: ubuntu-latest
`,
    "repo-security.yaml": `name: "[Project] Security"
on:
  push:
    paths:
      - "\${{ github.workflow }}"
jobs:
  analyze:
    runs-on: ubuntu-latest
`,
  })

  context.after(() => rm(repositoryRoot, { force: true, recursive: true }))

  const result = await validateWorkflowContract(repositoryRoot)
  const codes = result.violations.map((violation) => violation.code)

  assert.equal(result.summary.workflowCount, 3)
  assert.deepEqual(codes.sort(), [
    "WORKFLOW_FILENAME_INVALID",
    "WORKFLOW_FILENAME_INVALID",
    "WORKFLOW_NAME_PREFIX_INVALID",
    "WORKFLOW_SCHEMA_INVALID",
    "WORKFLOW_SCHEMA_INVALID",
    "WORKFLOW_SELF_PATH_MISSING",
  ])
})

test("rejects malformed and unsafe path filters without losing later diagnostics", async (context) => {
  const repositoryRoot = await createRepository({
    "project-demo-ci.yml": `name: "[Project] Demo CI"
on:
  pull_request:
    paths: "apps/demo/**"
  push:
    paths:
      - "../apps/demo/**"
      - ".github/workflows/project-demo-ci.yml"
jobs:
  check:
    runs-on: ubuntu-latest
`,
  })

  context.after(() => rm(repositoryRoot, { force: true, recursive: true }))

  const result = await validateWorkflowContract(repositoryRoot)

  assert.deepEqual(
    result.violations.map((violation) => violation.code),
    [
      "WORKFLOW_SCHEMA_INVALID",
      "WORKFLOW_SELF_PATH_MISSING",
      "WORKFLOW_SCHEMA_INVALID",
    ],
  )
  assert.ok(
    result.violations.every(
      (violation) => violation.path === ".github/workflows/project-demo-ci.yml",
    ),
  )
})

test("accepts immutable remote, local, Docker, and reusable workflow references", async (context) => {
  const commitSha = "0123456789abcdef0123456789abcdef01234567"
  const dockerDigest = "a".repeat(64)
  const repositoryRoot = await createRepository({
    "repo-actions-security.yml": `name: "[Repo] Actions Security"
on: workflow_dispatch
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${commitSha}
        with:
          persist-credentials: false
      - uses: example/action/subdirectory@${commitSha}
      - uses: ./.github/actions/example
      - uses: docker://ghcr.io/example/image@sha256:${dockerDigest}
  checkout-string-input:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@${commitSha}
        with:
          persist-credentials: "false"
  remote-reusable-workflow:
    uses: example/repository/.github/workflows/reusable.yml@${commitSha}
  local-reusable-workflow:
    uses: ./.github/workflows/reusable.yml
`,
  })

  context.after(() => rm(repositoryRoot, { force: true, recursive: true }))

  const result = await validateWorkflowContract(repositoryRoot)

  assert.deepEqual(result, {
    summary: { workflowCount: 1 },
    violations: [],
  })
})

test("reports mutable action refs and persisted checkout credentials together", async (context) => {
  const commitSha = "0123456789abcdef0123456789abcdef01234567"
  const uppercaseSha = "A".repeat(40)
  const repositoryRoot = await createRepository({
    "repo-actions-security.yml": `name: "[Repo] Actions Security"
on: workflow_dispatch
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: "actions/setup-node@\${{ inputs.ref }}"
      - uses: docker://alpine:latest
      - uses: actions/checkout@${commitSha}
        with:
          persist-credentials: true
      - uses: actions/setup-node@${uppercaseSha}
  reusable-workflow:
    uses: example/repository/.github/workflows/reusable.yml@main
`,
  })

  context.after(() => rm(repositoryRoot, { force: true, recursive: true }))

  const result = await validateWorkflowContract(repositoryRoot)

  assert.deepEqual(
    result.violations.map((violation) => violation.code),
    [
      "WORKFLOW_ACTION_REF_MUTABLE",
      "WORKFLOW_CHECKOUT_CREDENTIALS_PERSISTED",
      "WORKFLOW_ACTION_REF_MUTABLE",
      "WORKFLOW_ACTION_REF_MUTABLE",
      "WORKFLOW_CHECKOUT_CREDENTIALS_PERSISTED",
      "WORKFLOW_ACTION_REF_MUTABLE",
      "WORKFLOW_ACTION_REF_MUTABLE",
    ],
  )
})

test("reports malformed and unrecognized uses references as schema violations", async (context) => {
  const commitSha = "0123456789abcdef0123456789abcdef01234567"
  const dockerDigest = "b".repeat(64)
  const repositoryRoot = await createRepository({
    "repo-actions-security.yml": `name: "[Repo] Actions Security"
on: workflow_dispatch
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: 42
      - uses: https://github.com/example/action@${commitSha}
      - uses: ./../escape
      - uses: docker://
      - uses: "./\${{ inputs.action-path }}"
  invalid-reusable-workflow:
    uses: docker://example/image@sha256:${dockerDigest}
`,
  })

  context.after(() => rm(repositoryRoot, { force: true, recursive: true }))

  const result = await validateWorkflowContract(repositoryRoot)

  assert.deepEqual(
    result.violations.map((violation) => violation.code),
    [
      "WORKFLOW_SCHEMA_INVALID",
      "WORKFLOW_SCHEMA_INVALID",
      "WORKFLOW_SCHEMA_INVALID",
      "WORKFLOW_SCHEMA_INVALID",
      "WORKFLOW_ACTION_REF_MUTABLE",
      "WORKFLOW_SCHEMA_INVALID",
    ],
  )
})
