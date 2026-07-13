import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"

import { validatePackageContract } from "./packageContract.mjs"

const publicFiles = [
  "dist/assets/noise.webp",
  "dist/assets/noise.webp.d.ts",
  "dist/index.cjs",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/style.css",
]

function createExpectedPackageIdentity() {
  return {
    bugsUrl: "https://github.com/Cedarflake/Cedarflake-Lab/issues",
    homepage:
      "https://github.com/Cedarflake/Cedarflake-Lab/tree/main/packages/focus-orb#readme",
    license: "BSD-3-Clause",
    name: "@cedarflake/focus-orb",
    reactPeerRange: "^18.2.0 || ^19.0.0",
    repository: {
      directory: "packages/focus-orb",
      type: "git",
      url: "git+https://github.com/Cedarflake/Cedarflake-Lab.git",
    },
    type: "module",
  }
}

function createManifest() {
  return {
    bugs: {
      url: "https://github.com/Cedarflake/Cedarflake-Lab/issues",
    },
    description: "Reusable React WebGL focus orb component.",
    homepage:
      "https://github.com/Cedarflake/Cedarflake-Lab/tree/main/packages/focus-orb#readme",
    license: "BSD-3-Clause",
    name: "@cedarflake/focus-orb",
    files: ["dist"],
    peerDependencies: {
      react: "^18.2.0 || ^19.0.0",
    },
    publishConfig: {
      access: "public",
      registry: "https://registry.npmjs.org/",
    },
    repository: {
      directory: "packages/focus-orb",
      type: "git",
      url: "git+https://github.com/Cedarflake/Cedarflake-Lab.git",
    },
    type: "module",
    version: "0.1.0",
    main: "./dist/index.cjs",
    module: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
        require: "./dist/index.cjs",
      },
      "./style.css": "./dist/style.css",
      "./noise.webp": {
        types: "./dist/assets/noise.webp.d.ts",
        default: "./dist/assets/noise.webp",
      },
    },
  }
}

function createPack(files = publicFiles) {
  return {
    name: "@cedarflake/focus-orb",
    version: "0.1.0",
    files: [...files, "LICENSE", "README.md", "package.json"].map((path) => ({
      path,
    })),
  }
}

function expectedPackedFiles() {
  return createPack().files.map(({ path }) => path)
}

async function withPackageFixture(run) {
  const projectDirectory = await mkdtemp(join(tmpdir(), "focus-orb-package-"))

  try {
    for (const file of expectedPackedFiles()) {
      const filePath = resolve(projectDirectory, file)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, file)
    }

    await run(projectDirectory)
  } finally {
    await rm(projectDirectory, { force: true, recursive: true })
  }
}

test("accepts built public targets in a minimal package", async () => {
  await withPackageFixture(async (projectDirectory) => {
    const report = await validatePackageContract({
      expectedPackageIdentity: createExpectedPackageIdentity(),
      expectedPackedFiles: expectedPackedFiles(),
      manifest: createManifest(),
      maxPackageFileBytes: 1024 * 1024,
      pack: createPack(),
      projectDirectory,
    })

    assert.equal(report.fileCount, 9)
    assert.equal(report.name, "@cedarflake/focus-orb")
    assert.equal(report.publicTargetCount, 6)
    assert.ok(report.packageFileSize > 0)
    assert.equal(report.version, "0.1.0")
  })
})

test("rejects a public target omitted from the package", async () => {
  await withPackageFixture(async (projectDirectory) => {
    const pack = createPack(
      publicFiles.filter((file) => file !== "dist/style.css"),
    )

    await assert.rejects(
      validatePackageContract({
        expectedPackageIdentity: createExpectedPackageIdentity(),
        expectedPackedFiles: expectedPackedFiles(),
        manifest: createManifest(),
        maxPackageFileBytes: 1024 * 1024,
        pack,
        projectDirectory,
      }),
      /Public target is missing from the package: dist\/style\.css/,
    )
  })
})

test("rejects unexpected packed source and escaped exports", async () => {
  await withPackageFixture(async (projectDirectory) => {
    const manifest = createManifest()
    manifest.exports["./unsafe"] = "../src/index.ts"
    const pack = createPack([...publicFiles, "src/index.ts"])

    await assert.rejects(
      validatePackageContract({
        expectedPackageIdentity: createExpectedPackageIdentity(),
        expectedPackedFiles: expectedPackedFiles(),
        manifest,
        maxPackageFileBytes: 1024 * 1024,
        pack,
        projectDirectory,
      }),
      (error) => {
        assert.match(
          error.message,
          /must point inside \.\/dist\/: \.\.\/src\/index\.ts/,
        )
        assert.match(
          error.message,
          /Unexpected file in package: src\/index\.ts/,
        )
        return true
      },
    )
  })
})

test("rejects a mirror registry and an oversized package", async () => {
  await withPackageFixture(async (projectDirectory) => {
    const manifest = createManifest()
    manifest.publishConfig.registry = "https://registry.npmmirror.com/"

    await assert.rejects(
      validatePackageContract({
        expectedPackageIdentity: createExpectedPackageIdentity(),
        expectedPackedFiles: expectedPackedFiles(),
        manifest,
        maxPackageFileBytes: 1,
        pack: createPack(),
        projectDirectory,
      }),
      (error) => {
        assert.match(error.message, /publishConfig\.registry must be/)
        assert.match(error.message, /exceeds the 1 byte package-file budget/)
        return true
      },
    )
  })
})

test("rejects a self-consistent mutation of the package identity", async () => {
  await withPackageFixture(async (projectDirectory) => {
    const manifest = createManifest()
    manifest.name = "@cedarflake/focus-orbb"
    manifest.license = "MIT"
    manifest.type = "commonjs"
    manifest.version = "next"
    manifest.peerDependencies.react = "*"
    const pack = createPack()
    pack.name = manifest.name
    pack.version = manifest.version

    await assert.rejects(
      validatePackageContract({
        expectedPackageIdentity: createExpectedPackageIdentity(),
        expectedPackedFiles: expectedPackedFiles(),
        manifest,
        maxPackageFileBytes: 1024 * 1024,
        pack,
        projectDirectory,
      }),
      (error) => {
        assert.match(error.message, /package\.json name must be/)
        assert.match(error.message, /package\.json license must be/)
        assert.match(error.message, /package\.json type must be/)
        assert.match(
          error.message,
          /package\.json version must be valid SemVer/,
        )
        assert.match(
          error.message,
          /package\.json peerDependencies\.react must be/,
        )
        return true
      },
    )
  })
})
