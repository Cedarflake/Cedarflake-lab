import { DomainRuleError } from "./errors"

export const publicationActions = [
  "publish",
  "withdraw",
  "redact",
  "suppress",
] as const

export type PublicationAction = (typeof publicationActions)[number]
export type PublicationDisposition =
  | "unpublished"
  | "published"
  | "withdrawn"
  | "redacted"
  | "suppressed"

export interface PublicationState {
  publicationVersion: number
  disposition: PublicationDisposition
  wasEverPublished: boolean
}

export interface PublicationCommand {
  action: PublicationAction
  expectedPublicationVersion: number
}

export function applyPublicationCommand(
  current: PublicationState,
  command: PublicationCommand,
): PublicationState {
  if (command.expectedPublicationVersion !== current.publicationVersion) {
    throw new DomainRuleError(
      "PUBLICATION_VERSION_CONFLICT",
      "The publication changed after it was reviewed",
    )
  }

  if (
    current.disposition === "suppressed" ||
    (current.disposition === "redacted" && command.action !== "suppress")
  ) {
    throw new DomainRuleError(
      "PUBLICATION_TERMINAL",
      "Redacted and suppressed revisions cannot be published again",
    )
  }

  let disposition: PublicationDisposition

  switch (command.action) {
    case "publish":
      if (current.disposition === "published") {
        throw new DomainRuleError(
          "PUBLICATION_UNCHANGED",
          "The revision is already published",
        )
      }
      disposition = "published"
      break
    case "withdraw":
      if (current.disposition !== "published") {
        throw new DomainRuleError(
          "PUBLICATION_NOT_LIVE",
          "Only a published revision can be withdrawn",
        )
      }
      disposition = "withdrawn"
      break
    case "redact":
      if (!current.wasEverPublished) {
        throw new DomainRuleError(
          "PUBLICATION_NEVER_PUBLIC",
          "A private revision has no public snapshot to redact",
        )
      }
      disposition = "redacted"
      break
    case "suppress":
      if (!current.wasEverPublished) {
        throw new DomainRuleError(
          "PUBLICATION_NEVER_PUBLIC",
          "A private revision has no public snapshot to suppress",
        )
      }
      disposition = "suppressed"
      break
  }

  return {
    publicationVersion: current.publicationVersion + 1,
    disposition,
    wasEverPublished:
      current.wasEverPublished || command.action === "publish",
  }
}
