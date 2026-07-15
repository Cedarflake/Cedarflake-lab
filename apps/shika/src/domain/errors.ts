export class DomainRuleError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "DomainRuleError"
    this.code = code
  }
}
