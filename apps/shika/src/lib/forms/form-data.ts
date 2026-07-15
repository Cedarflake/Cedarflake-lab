export class FormDataFieldError extends Error {
  constructor() {
    super("Form data is invalid")
    this.name = "FormDataFieldError"
  }
}

export function readSingleTextField(formData: FormData, name: string) {
  const values = formData.getAll(name)

  if (values.length > 1) throw new FormDataFieldError()

  const value = values[0]
  if (value === undefined) return ""
  if (typeof value !== "string") throw new FormDataFieldError()
  return value
}

export function readSingleJsonField(formData: FormData, name: string): unknown {
  const value = readSingleTextField(formData, name)

  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new FormDataFieldError()
  }
}
