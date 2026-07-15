import { z } from "zod"

import { incidentPublicSnapshotSchema } from "./incident-snapshots"
import { maintenancePublicSnapshotSchema } from "./maintenance-snapshots"
import { statusPublicSnapshotSchema } from "./snapshots"

export const componentStatusTimelineSnapshotSchema =
  statusPublicSnapshotSchema
export const incidentTimelineSnapshotSchema = incidentPublicSnapshotSchema
export const maintenanceTimelineSnapshotSchema = maintenancePublicSnapshotSchema

export const redactedTimelineSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("redacted"),
    publicEntryId: z.string().uuid(),
  })
  .strict()

export const withdrawnTimelineSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("withdrawn"),
    publicEntryId: z.string().uuid(),
  })
  .strict()

export type ComponentStatusTimelineSnapshot = z.infer<
  typeof componentStatusTimelineSnapshotSchema
>
export type IncidentTimelineSnapshot = z.infer<
  typeof incidentTimelineSnapshotSchema
>
export type MaintenanceTimelineSnapshot = z.infer<
  typeof maintenanceTimelineSnapshotSchema
>
export type RedactedTimelineSnapshot = z.infer<
  typeof redactedTimelineSnapshotSchema
>
export type WithdrawnTimelineSnapshot = z.infer<
  typeof withdrawnTimelineSnapshotSchema
>

export function createRedactedTimelineSnapshot(
  snapshot: RedactedTimelineSnapshot,
) {
  return redactedTimelineSnapshotSchema.parse(snapshot)
}

export function createWithdrawnTimelineSnapshot(
  snapshot: WithdrawnTimelineSnapshot,
) {
  return withdrawnTimelineSnapshotSchema.parse(snapshot)
}
