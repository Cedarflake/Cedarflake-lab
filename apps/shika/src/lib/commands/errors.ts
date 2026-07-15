export class CommandConflictError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "CommandConflictError"
    this.code = code
  }
}

export class CommandValidationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "CommandValidationError"
    this.code = code
  }
}

export class CommandNotFoundError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "CommandNotFoundError"
    this.code = code
  }
}

export class IdempotencyConflictError extends CommandConflictError {
  constructor() {
    super(
      "IDEMPOTENCY_KEY_REUSED",
      "The idempotency key was already used with a different payload",
    )
    this.name = "IdempotencyConflictError"
  }
}
