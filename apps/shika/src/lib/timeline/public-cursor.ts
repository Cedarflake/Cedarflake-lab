import { Buffer } from "node:buffer"
import { createHmac, timingSafeEqual } from "node:crypto"

import { z } from "zod"

import type { PublicTimelineCursor } from "@/domain/timeline"

const CURSOR_CONTEXT = "shika.public-timeline.cursor.v1"
const MAX_CURSOR_LENGTH = 2_048
const MINIMUM_KEY_BYTES = 32
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/

const nonnegativeSafeInteger = z.number().int().nonnegative().safe()
const serializedCursorSchema = z
  .object({
    v: z.literal(1),
    a: nonnegativeSafeInteger,
    e: nonnegativeSafeInteger,
    l: z
      .tuple([
        nonnegativeSafeInteger,
        nonnegativeSafeInteger,
        nonnegativeSafeInteger,
        z.string().min(1).max(256),
      ])
      .nullable(),
  })
  .strict()

type SerializedCursor = z.infer<typeof serializedCursorSchema>

export class PublicCursorConfigurationError extends Error {
  constructor() {
    super("Public timeline cursor key is invalid")
    this.name = "PublicCursorConfigurationError"
  }
}

export class PublicCursorError extends Error {
  constructor() {
    super("Public timeline cursor is invalid")
    this.name = "PublicCursorError"
  }
}

export interface PublicCursorCodec {
  encode(cursor: PublicTimelineCursor): string
  decode(value: string): PublicTimelineCursor
}

function normalizeKey(key: string | Uint8Array) {
  const normalized =
    typeof key === "string" ? Buffer.from(key, "utf8") : Buffer.from(key)

  if (normalized.byteLength < MINIMUM_KEY_BYTES) {
    throw new PublicCursorConfigurationError()
  }

  return normalized
}

function signPayload(payload: string, key: Uint8Array) {
  return createHmac("sha256", key)
    .update(CURSOR_CONTEXT)
    .update("\0")
    .update(payload)
    .digest()
}

function serializeCursor(cursor: PublicTimelineCursor): SerializedCursor {
  const serialized = {
    v: cursor.version,
    a: cursor.asOfPublicOrdinal,
    e: cursor.privacyEpoch,
    l: cursor.last
      ? [
          cursor.last.effectiveAt,
          cursor.last.recordedAt,
          cursor.last.publicOrdinal,
          cursor.last.publicEntryId,
        ]
      : null,
  }
  const result = serializedCursorSchema.safeParse(serialized)

  if (!result.success || (result.data.l && result.data.l[2] > result.data.a)) {
    throw new PublicCursorError()
  }

  return result.data
}

function deserializeCursor(serialized: unknown): PublicTimelineCursor {
  const result = serializedCursorSchema.safeParse(serialized)

  if (!result.success || (result.data.l && result.data.l[2] > result.data.a)) {
    throw new PublicCursorError()
  }

  const last = result.data.l

  return {
    version: 1,
    asOfPublicOrdinal: result.data.a,
    privacyEpoch: result.data.e,
    last: last
      ? {
          effectiveAt: last[0],
          recordedAt: last[1],
          publicOrdinal: last[2],
          publicEntryId: last[3],
        }
      : null,
  }
}

function decodeCanonicalBase64Url(value: string) {
  if (!BASE64_URL_PATTERN.test(value)) throw new PublicCursorError()

  const decoded = Buffer.from(value, "base64url")
  if (decoded.toString("base64url") !== value) throw new PublicCursorError()

  return decoded
}

export function createPublicCursorCodec(
  key: string | Uint8Array,
): PublicCursorCodec {
  const normalizedKey = normalizeKey(key)

  return {
    encode(cursor) {
      const payload = Buffer.from(
        JSON.stringify(serializeCursor(cursor)),
        "utf8",
      ).toString("base64url")
      const signature = signPayload(payload, normalizedKey).toString("base64url")

      return `${payload}.${signature}`
    },
    decode(value) {
      if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > MAX_CURSOR_LENGTH
      ) {
        throw new PublicCursorError()
      }

      const parts = value.split(".")
      if (parts.length !== 2) throw new PublicCursorError()

      const [payload, signature] = parts
      if (!payload || !signature) throw new PublicCursorError()

      const signatureBytes = decodeCanonicalBase64Url(signature)
      const expectedSignature = signPayload(payload, normalizedKey)
      if (
        signatureBytes.byteLength !== expectedSignature.byteLength ||
        !timingSafeEqual(signatureBytes, expectedSignature)
      ) {
        throw new PublicCursorError()
      }

      const payloadBytes = decodeCanonicalBase64Url(payload)

      try {
        return deserializeCursor(JSON.parse(payloadBytes.toString("utf8")))
      } catch (error) {
        if (error instanceof PublicCursorError) throw error
        throw new PublicCursorError()
      }
    },
  }
}
