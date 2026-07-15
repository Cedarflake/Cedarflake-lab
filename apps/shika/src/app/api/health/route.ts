import { NextResponse } from "next/server"

import { getDatabaseConnection } from "@/lib/db/client"

import { checkDatabaseReadiness, checkHealth } from "./health"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
}

async function checkApplicationReadiness() {
  const connection = await getDatabaseConnection()
  await checkDatabaseReadiness(connection)
}

export async function GET() {
  const result = await checkHealth(checkApplicationReadiness)

  return NextResponse.json(result.body, {
    headers: RESPONSE_HEADERS,
    status: result.status,
  })
}
