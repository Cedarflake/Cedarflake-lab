import { z } from "zod"

const githubOwnerIdSchema = z.string().regex(/^[1-9]\d*$/)

export function normalizeGitHubOwnerId(value: string) {
  return githubOwnerIdSchema.parse(value)
}

export function createOwnerKey(githubOwnerId: string) {
  return `github:${normalizeGitHubOwnerId(githubOwnerId)}` as const
}

export function isOwnerGitHubAccount(
  providerId: string,
  accountId: string,
  githubOwnerId: string,
) {
  try {
    return (
      providerId === "github" &&
      normalizeGitHubOwnerId(accountId) === normalizeGitHubOwnerId(githubOwnerId)
    )
  } catch {
    return false
  }
}
