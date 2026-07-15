import "server-only"

import { z } from "zod"

import { DomainRuleError } from "@/domain/errors"
import { OwnerAuthorizationError } from "@/lib/auth/require-owner"
import {
  CommandConflictError,
  CommandNotFoundError,
  CommandValidationError,
} from "@/lib/commands/errors"

import {
  createAdminActionFailureState,
  type AdminActionState,
} from "./admin-action-state"
import { FormDataFieldError } from "./form-data"

export function toAdminActionError(error: unknown): AdminActionState {
  if (error instanceof OwnerAuthorizationError) {
    return createAdminActionFailureState("reauth_required")
  }

  if (error instanceof CommandConflictError) {
    return createAdminActionFailureState("conflict")
  }

  if (
    error instanceof FormDataFieldError ||
    error instanceof z.ZodError ||
    error instanceof DomainRuleError ||
    error instanceof CommandValidationError ||
    error instanceof CommandNotFoundError
  ) {
    return createAdminActionFailureState("error")
  }

  throw error
}
