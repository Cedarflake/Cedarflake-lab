import type { OwnerIdentity } from "@/lib/auth/owner-account"

export interface OwnerCommandRunnerDependencies<Input, Result> {
  authorize: () => Promise<OwnerIdentity>
  execute: (owner: OwnerIdentity, input: Input) => Promise<Result>
}

export function createOwnerCommandRunner<Input, Result>(
  dependencies: OwnerCommandRunnerDependencies<Input, Result>,
) {
  return async (input: Input) => {
    const owner = await dependencies.authorize()
    return dependencies.execute(owner, input)
  }
}
