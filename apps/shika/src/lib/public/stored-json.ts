import type { z } from "zod"

export function parseStoredJson<Output>(
  schema: z.ZodType<Output>,
  value: unknown,
  createError: () => Error,
) {
  if (typeof value !== "string") throw createError()

  try {
    const result = schema.safeParse(JSON.parse(value) as unknown)
    if (!result.success) throw createError()
    return result.data
  } catch (error) {
    if (error instanceof SyntaxError) throw createError()
    throw error
  }
}
