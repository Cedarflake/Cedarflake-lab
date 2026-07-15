import { toNextJsHandler } from "better-auth/next-js"

import { getAuth } from "@/lib/auth/server"

export const runtime = "nodejs"

const handler = toNextJsHandler(async (request) => {
  const auth = await getAuth()
  return auth.handler(request)
})

export const { GET, POST } = handler
