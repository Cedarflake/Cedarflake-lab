import { randomUUID } from "node:crypto"

import { z } from "zod"

import type { OwnerIdentity } from "@/lib/auth/owner-account"
import type { DatabaseConnection } from "@/lib/db/create-database"
import {
  componentPublicSnapshotSchema,
  statusPublicSnapshotSchema,
  type ComponentPublicSnapshot,
  type StatusPublicSnapshot,
} from "@/lib/public/snapshots"
import { parseStoredJson } from "@/lib/public/stored-json"
import {
  createRedactedTimelineSnapshot,
  createWithdrawnTimelineSnapshot,
} from "@/lib/public/timeline-snapshots"

import { hashCommandPayload } from "./canonical-payload"
import {
  readComponentPrivacyParents,
  type ComponentPrivacyParentDependency,
} from "./component-privacy-dependencies"
import { readCommandReceipt, writeCommandReceipt } from "./command-receipts"
import {
  CommandConflictError,
  CommandNotFoundError,
  CommandValidationError,
} from "./errors"
import {
  insertIncidentPublicationClosureEvents,
  prepareIncidentPublicationClosure,
  type PreparedIncidentPublicationClosure,
} from "./incident-publication"
import {
  insertMaintenancePublicationClosureEvents,
  prepareMaintenancePublicationClosure,
  type PreparedMaintenancePublicationClosure,
} from "./maintenance-publication"
import { allocateOrdinals } from "./ordinal-allocation"
import type { PublicationEventAllocationSlice } from "./publication-event-allocation"
import {
  withWriteTransaction,
  type StatementExecutor,
} from "./write-transaction"

const publicationActionSchema = z.enum([
  "publish",
  "withdraw",
  "redact",
  "suppress",
])

const parentGuardSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("incident"),
      incidentId: z.uuid(),
      expectedIncidentVersion: z.number().int().positive().safe(),
      expectedIncidentPublicationVersion: z
        .number()
        .int()
        .positive()
        .safe(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("maintenance"),
      maintenanceWindowId: z.uuid(),
      expectedMaintenanceVersion: z.number().int().positive().safe(),
      expectedMaintenancePublicationVersion: z
        .number()
        .int()
        .positive()
        .safe(),
    })
    .strict(),
])

const relatedComponentGuardSchema = z
  .object({
    componentId: z.uuid(),
    expectedComponentVersion: z.number().int().positive().safe(),
    expectedComponentMetadataPublicationVersion: z
      .number()
      .int()
      .positive()
      .safe(),
  })
  .strict()

export const closeComponentPublicationInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    componentId: z.uuid(),
    expectedComponentVersion: z.number().int().positive().safe(),
    expectedMetadataPublicationVersion: z
      .number()
      .int()
      .positive()
      .safe(),
    expectedStatusPublicationVersion: z
      .number()
      .int()
      .nonnegative()
      .safe(),
    action: z.enum(["withdraw", "redact", "suppress"]),
    dependentParents: z.array(parentGuardSchema).max(100),
    relatedComponents: z.array(relatedComponentGuardSchema).max(100),
  })
  .strict()
  .superRefine((input, context) => {
    const parentKeys = new Set<string>()
    input.dependentParents.forEach((parent, index) => {
      const key =
        parent.kind === "incident"
          ? `incident:${parent.incidentId}`
          : `maintenance:${parent.maintenanceWindowId}`
      if (parentKeys.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["dependentParents", index],
          message: "Dependent parents must be unique",
        })
      }
      parentKeys.add(key)
    })

    const componentIds = new Set<string>()
    input.relatedComponents.forEach((component, index) => {
      if (
        component.componentId === input.componentId ||
        componentIds.has(component.componentId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["relatedComponents", index, "componentId"],
          message:
            "Related components must be unique and exclude the target component",
        })
      }
      componentIds.add(component.componentId)
    })
  })

export type CloseComponentPublicationInput = z.infer<
  typeof closeComponentPublicationInputSchema
>

export interface CloseComponentPublicationResult {
  componentId: string
  componentVersion: number
  metadataPublicationVersion: number
  statusPublicationVersion: number
  publicPrivacyEpoch: number
  componentVersions: readonly {
    componentId: string
    componentVersion: number
  }[]
  parentPublications: readonly (
    | {
        kind: "incident"
        incidentId: string
        incidentPublicationVersion: number
      }
    | {
        kind: "maintenance"
        maintenanceWindowId: string
        maintenancePublicationVersion: number
      }
  )[]
}

interface ComponentRoot {
  componentId: string
  publicId: string
  version: number
}

interface PublicationStreamHead {
  version: number
  action: z.infer<typeof publicationActionSchema> | null
  targetSourceId: string | null
  resultingDisposition: "private" | "published" | "closed"
  resultingSourceId: string | null
}

interface PublishedMetadataSource {
  sourceId: string
  sourceRevision: number
  firstPublicationVersion: number
  latestAction: z.infer<typeof publicationActionSchema>
  snapshot: ComponentPublicSnapshot
}

interface PublishedStatusSource {
  sourceId: string
  sourceRevision: number
  firstPublicationVersion: number
  latestAction: z.infer<typeof publicationActionSchema>
  publicEntryId: string
  effectiveAt: number
  recordedAt: number
  snapshot: StatusPublicSnapshot
}

interface ComponentGuardState {
  componentId: string
  publicId: string
  version: number
  metadataPublicationVersion: number
}

interface PreparedComponentClosure {
  root: ComponentRoot
  metadataHead: PublicationStreamHead
  statusHead: PublicationStreamHead
  metadataTargets: readonly PublishedMetadataSource[]
  statusTargets: readonly PublishedStatusSource[]
}

const resultSchema = z
  .object({
    componentId: z.uuid(),
    componentVersion: z.number().int().positive().safe(),
    metadataPublicationVersion: z.number().int().positive().safe(),
    statusPublicationVersion: z.number().int().nonnegative().safe(),
    publicPrivacyEpoch: z.number().int().nonnegative().safe(),
    componentVersions: z.array(
      z
        .object({
          componentId: z.uuid(),
          componentVersion: z.number().int().positive().safe(),
        })
        .strict(),
    ),
    parentPublications: z.array(
      z.discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("incident"),
            incidentId: z.uuid(),
            incidentPublicationVersion: z
              .number()
              .int()
              .positive()
              .safe(),
          })
          .strict(),
        z
          .object({
            kind: z.literal("maintenance"),
            maintenanceWindowId: z.uuid(),
            maintenancePublicationVersion: z
              .number()
              .int()
              .positive()
              .safe(),
          })
          .strict(),
      ]),
    ),
  })
  .strict()

function invalidComponentState() {
  return new CommandValidationError(
    "INVALID_COMPONENT_STATE",
    "Stored component publication state is invalid",
  )
}

function invalidPublicSnapshot() {
  return new CommandValidationError(
    "INVALID_PUBLIC_SNAPSHOT",
    "Stored public component data is invalid",
  )
}

function normalizeInput(
  input: CloseComponentPublicationInput,
): CloseComponentPublicationInput {
  return {
    ...input,
    dependentParents: input.dependentParents.toSorted((left, right) => {
      const leftKey =
        left.kind === "incident"
          ? `incident:${left.incidentId}`
          : `maintenance:${left.maintenanceWindowId}`
      const rightKey =
        right.kind === "incident"
          ? `incident:${right.incidentId}`
          : `maintenance:${right.maintenanceWindowId}`
      return leftKey.localeCompare(rightKey)
    }),
    relatedComponents: input.relatedComponents.toSorted((left, right) =>
      left.componentId.localeCompare(right.componentId),
    ),
  }
}

function parseResult(resultRef: string): CloseComponentPublicationResult {
  try {
    return resultSchema.parse(JSON.parse(resultRef) as unknown)
  } catch {
    throw new CommandValidationError(
      "INVALID_COMMAND_RECEIPT",
      "Stored component publication result is invalid",
    )
  }
}

async function readComponentRoot(
  transaction: StatementExecutor,
  componentId: string,
): Promise<ComponentRoot> {
  const result = await transaction.execute({
    sql: "SELECT id, public_id, version FROM components WHERE id = ? LIMIT 1",
    args: [componentId],
  })
  const row = result.rows[0]

  if (!row) {
    throw new CommandNotFoundError(
      "COMPONENT_NOT_FOUND",
      "The component does not exist",
    )
  }

  const parsed = z
    .object({
      id: z.uuid(),
      public_id: z.uuid(),
      version: z.number().int().positive().safe(),
    })
    .strict()
    .safeParse(row)
  if (!parsed.success) throw invalidComponentState()

  return {
    componentId: parsed.data.id,
    publicId: parsed.data.public_id,
    version: parsed.data.version,
  }
}

async function readPublicationHead(
  transaction: StatementExecutor,
  streamType: "component_metadata" | "component_status",
  componentId: string,
): Promise<PublicationStreamHead> {
  const result = await transaction.execute({
    sql: `
      SELECT
        publication_version,
        action,
        target_source_id,
        resulting_disposition,
        resulting_source_id,
        resulting_current_snapshot_json
      FROM publication_events
      WHERE stream_type = ? AND stream_id = ?
      ORDER BY publication_version DESC, id DESC
      LIMIT 1
    `,
    args: [streamType, componentId],
  })
  const row = result.rows[0]

  if (!row) {
    return {
      version: 0,
      action: null,
      targetSourceId: null,
      resultingDisposition: "private",
      resultingSourceId: null,
    }
  }

  const parsed = z
    .object({
      publication_version: z.number().int().positive().safe(),
      action: publicationActionSchema,
      target_source_id: z.uuid(),
      resulting_disposition: z.enum(["published", "closed"]),
      resulting_source_id: z.string().nullable(),
      resulting_current_snapshot_json: z.unknown().nullable(),
    })
    .strict()
    .safeParse(row)
  if (!parsed.success) throw invalidComponentState()

  const isPublished =
    parsed.data.resulting_disposition === "published" &&
    parsed.data.resulting_source_id !== null &&
    parsed.data.resulting_current_snapshot_json !== null
  const isClosed =
    parsed.data.resulting_disposition === "closed" &&
    parsed.data.resulting_source_id === null &&
    parsed.data.resulting_current_snapshot_json === null
  if (!isPublished && !isClosed) throw invalidComponentState()

  return {
    version: parsed.data.publication_version,
    action: parsed.data.action,
    targetSourceId: parsed.data.target_source_id,
    resultingDisposition: parsed.data.resulting_disposition,
    resultingSourceId: parsed.data.resulting_source_id,
  }
}

async function readMetadataSources(
  transaction: StatementExecutor,
  root: ComponentRoot,
): Promise<PublishedMetadataSource[]> {
  const result = await transaction.execute({
    sql: `
      SELECT
        publication_events.publication_version,
        publication_events.action,
        publication_events.target_source_type,
        publication_events.target_source_id,
        publication_events.target_source_revision,
        publication_events.target_snapshot_json,
        publication_events.resulting_disposition,
        component_revisions.component_id AS source_component_id,
        component_revisions.component_version AS source_component_version
      FROM publication_events
      LEFT JOIN component_revisions
        ON component_revisions.id = publication_events.target_source_id
      WHERE publication_events.stream_type = 'component_metadata'
        AND publication_events.stream_id = ?
      ORDER BY publication_events.publication_version, publication_events.id
    `,
    args: [root.componentId],
  })
  const sources = new Map<string, PublishedMetadataSource>()

  for (const row of result.rows) {
    const action = publicationActionSchema.safeParse(row.action)
    const sourceId = z.uuid().safeParse(row.target_source_id)
    const sourceRevision = z
      .number()
      .int()
      .positive()
      .safe()
      .safeParse(row.target_source_revision)
    const publicationVersion = z
      .number()
      .int()
      .positive()
      .safe()
      .safeParse(row.publication_version)

    if (
      !action.success ||
      !sourceId.success ||
      !sourceRevision.success ||
      !publicationVersion.success ||
      row.target_source_type !== "component_revision" ||
      row.source_component_id !== root.componentId ||
      Number(row.source_component_version) !== sourceRevision.data
    ) {
      throw invalidComponentState()
    }

    const existing = sources.get(sourceId.data)
    if (action.data === "publish") {
      if (row.resulting_disposition !== "published") {
        throw invalidComponentState()
      }
      const snapshot = parseStoredJson(
        componentPublicSnapshotSchema,
        row.target_snapshot_json,
        invalidPublicSnapshot,
      )
      if (snapshot.componentPublicId !== root.publicId) {
        throw invalidPublicSnapshot()
      }

      if (existing) {
        if (JSON.stringify(existing.snapshot) !== JSON.stringify(snapshot)) {
          throw invalidPublicSnapshot()
        }
        existing.latestAction = "publish"
      } else {
        sources.set(sourceId.data, {
          sourceId: sourceId.data,
          sourceRevision: sourceRevision.data,
          firstPublicationVersion: publicationVersion.data,
          latestAction: "publish",
          snapshot,
        })
      }
      continue
    }

    if (!existing || row.resulting_disposition !== "closed") {
      throw invalidComponentState()
    }
    if (action.data !== "suppress") {
      const snapshot = parseStoredJson(
        componentPublicSnapshotSchema,
        row.target_snapshot_json,
        invalidPublicSnapshot,
      )
      if (JSON.stringify(snapshot) !== JSON.stringify(existing.snapshot)) {
        throw invalidPublicSnapshot()
      }
    }
    existing.latestAction = action.data
  }

  return [...sources.values()].toSorted(
    (left, right) =>
      left.firstPublicationVersion - right.firstPublicationVersion ||
      left.sourceId.localeCompare(right.sourceId),
  )
}

async function readStatusSources(
  transaction: StatementExecutor,
  root: ComponentRoot,
): Promise<PublishedStatusSource[]> {
  const result = await transaction.execute({
    sql: `
      SELECT
        publication_events.publication_version,
        publication_events.action,
        publication_events.target_source_type,
        publication_events.target_source_id,
        publication_events.target_source_revision,
        publication_events.target_snapshot_json,
        status_transitions.component_id AS source_component_id,
        status_transitions.component_version AS source_component_version,
        status_transitions.public_entry_id AS source_public_entry_id,
        status_transitions.effective_at AS source_effective_at,
        status_transitions.recorded_at AS source_recorded_at
      FROM publication_events
      LEFT JOIN status_transitions
        ON status_transitions.id = publication_events.target_source_id
      WHERE publication_events.stream_type = 'component_status'
        AND publication_events.stream_id = ?
      ORDER BY publication_events.publication_version, publication_events.id
    `,
    args: [root.componentId],
  })
  const sources = new Map<string, PublishedStatusSource>()

  for (const row of result.rows) {
    const action = publicationActionSchema.safeParse(row.action)
    const sourceId = z.uuid().safeParse(row.target_source_id)
    const sourceRevision = z
      .number()
      .int()
      .positive()
      .safe()
      .safeParse(row.target_source_revision)
    const publicationVersion = z
      .number()
      .int()
      .positive()
      .safe()
      .safeParse(row.publication_version)
    const publicEntryId = z.uuid().safeParse(row.source_public_entry_id)
    const effectiveAt = z
      .number()
      .int()
      .nonnegative()
      .safe()
      .safeParse(row.source_effective_at)
    const recordedAt = z
      .number()
      .int()
      .nonnegative()
      .safe()
      .safeParse(row.source_recorded_at)

    if (
      !action.success ||
      !sourceId.success ||
      !sourceRevision.success ||
      !publicationVersion.success ||
      !publicEntryId.success ||
      !effectiveAt.success ||
      !recordedAt.success ||
      row.target_source_type !== "status_transition" ||
      row.source_component_id !== root.componentId ||
      Number(row.source_component_version) !== sourceRevision.data
    ) {
      throw invalidComponentState()
    }

    const existing = sources.get(sourceId.data)
    if (action.data === "publish") {
      const snapshot = parseStoredJson(
        statusPublicSnapshotSchema,
        row.target_snapshot_json,
        invalidPublicSnapshot,
      )
      if (
        snapshot.componentPublicId !== root.publicId ||
        snapshot.publicEntryId !== publicEntryId.data ||
        snapshot.effectiveAt !== effectiveAt.data
      ) {
        throw invalidPublicSnapshot()
      }

      if (existing) {
        if (JSON.stringify(existing.snapshot) !== JSON.stringify(snapshot)) {
          throw invalidPublicSnapshot()
        }
        existing.latestAction = "publish"
      } else {
        sources.set(sourceId.data, {
          sourceId: sourceId.data,
          sourceRevision: sourceRevision.data,
          firstPublicationVersion: publicationVersion.data,
          latestAction: "publish",
          publicEntryId: publicEntryId.data,
          effectiveAt: effectiveAt.data,
          recordedAt: recordedAt.data,
          snapshot,
        })
      }
      continue
    }

    if (!existing) throw invalidComponentState()
    if (action.data !== "suppress") {
      const snapshot = parseStoredJson(
        statusPublicSnapshotSchema,
        row.target_snapshot_json,
        invalidPublicSnapshot,
      )
      if (JSON.stringify(snapshot) !== JSON.stringify(existing.snapshot)) {
        throw invalidPublicSnapshot()
      }
    }
    existing.latestAction = action.data
  }

  return [...sources.values()].toSorted(
    (left, right) =>
      left.firstPublicationVersion - right.firstPublicationVersion ||
      left.sourceId.localeCompare(right.sourceId),
  )
}

function currentSourceLast<Source extends { sourceId: string }>(
  sources: readonly Source[],
  head: PublicationStreamHead,
) {
  const currentSourceId = head.resultingSourceId ?? head.targetSourceId
  if (!currentSourceId) return [...sources]

  const current = sources.find((source) => source.sourceId === currentSourceId)
  if (!current) return [...sources]
  return [
    ...sources.filter((source) => source.sourceId !== currentSourceId),
    current,
  ]
}

function prepareOwnClosureTargets(
  root: ComponentRoot,
  metadataHead: PublicationStreamHead,
  statusHead: PublicationStreamHead,
  metadataSources: readonly PublishedMetadataSource[],
  statusSources: readonly PublishedStatusSource[],
  action: CloseComponentPublicationInput["action"],
): PreparedComponentClosure {
  if (metadataHead.version === 0 || metadataSources.length === 0) {
    throw new CommandValidationError(
      "COMPONENT_NOT_PUBLIC",
      "A component without public history has nothing to close",
    )
  }
  if (metadataHead.action === "suppress") {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "A suppressed component cannot change publication state",
    )
  }
  if (metadataHead.action === "redact" && action !== "suppress") {
    throw new CommandValidationError(
      "PUBLICATION_TERMINAL",
      "A redacted component can only be suppressed",
    )
  }
  if (
    action === "withdraw" &&
    (metadataHead.action !== "publish" ||
      metadataHead.resultingDisposition !== "published")
  ) {
    throw new CommandValidationError(
      "PUBLICATION_NOT_LIVE",
      "Only a currently public component can be withdrawn",
    )
  }

  const metadataCandidates =
    action === "withdraw"
      ? metadataSources.filter(
          (source) =>
            source.sourceId === metadataHead.resultingSourceId &&
            source.latestAction === "publish",
        )
      : metadataSources.filter((source) =>
          action === "redact"
            ? source.latestAction === "publish" ||
              source.latestAction === "withdraw"
            : source.latestAction !== "suppress",
        )
  const statusCandidates = statusSources.filter((source) =>
    action === "redact"
      ? source.latestAction === "publish" ||
        source.latestAction === "withdraw"
      : action === "suppress"
        ? source.latestAction !== "suppress"
        : source.latestAction === "publish",
  )

  if (metadataCandidates.length === 0) {
    throw invalidComponentState()
  }

  return {
    root,
    metadataHead,
    statusHead,
    metadataTargets: currentSourceLast(metadataCandidates, metadataHead),
    statusTargets: currentSourceLast(statusCandidates, statusHead),
  }
}

function parentKey(parent: ComponentPrivacyParentDependency) {
  return `${parent.kind}:${parent.id}`
}

function inputParentKey(
  parent: CloseComponentPublicationInput["dependentParents"][number],
) {
  return parent.kind === "incident"
    ? `incident:${parent.incidentId}`
    : `maintenance:${parent.maintenanceWindowId}`
}

function assertParentReview(
  input: CloseComponentPublicationInput,
  discovered: readonly ComponentPrivacyParentDependency[],
) {
  if (input.action === "withdraw") {
    if (input.dependentParents.length > 0 || input.relatedComponents.length > 0) {
      throw new CommandValidationError(
        "COMPONENT_WITHDRAW_GUARDS_INVALID",
        "Component withdrawal does not accept dependant closure guards",
      )
    }
    if (discovered.length > 0) {
      throw new CommandValidationError(
        "COMPONENT_HAS_PUBLIC_DEPENDENCIES",
        "Redact or suppress public incident and maintenance history before making this component private",
      )
    }
    return
  }

  const discoveredKeys = discovered.map(parentKey)
  const reviewedKeys = input.dependentParents.map(inputParentKey)
  if (
    discoveredKeys.length !== reviewedKeys.length ||
    discoveredKeys.some((key, index) => key !== reviewedKeys[index])
  ) {
    throw new CommandConflictError(
      "COMPONENT_PRIVACY_REVIEW_CONFLICT",
      "Public dependant records changed after the privacy action was reviewed",
    )
  }

  const guardByKey = new Map(
    input.dependentParents.map((parent) => [inputParentKey(parent), parent]),
  )
  for (const parent of discovered) {
    const guard = guardByKey.get(parentKey(parent))
    if (!guard) throw invalidComponentState()

    const reviewedVersion =
      guard.kind === "incident"
        ? guard.expectedIncidentVersion
        : guard.expectedMaintenanceVersion
    const reviewedPublicationVersion =
      guard.kind === "incident"
        ? guard.expectedIncidentPublicationVersion
        : guard.expectedMaintenancePublicationVersion
    if (
      reviewedVersion !== parent.version ||
      reviewedPublicationVersion !== parent.publicationVersion
    ) {
      throw new CommandConflictError(
        "COMPONENT_PRIVACY_REVIEW_CONFLICT",
        "A dependant record changed after the privacy action was reviewed",
      )
    }
  }
}

async function prepareParentClosures(
  transaction: StatementExecutor,
  input: CloseComponentPublicationInput,
  discovered: readonly ComponentPrivacyParentDependency[],
  recordedAt: number,
) {
  const guardByKey = new Map(
    input.dependentParents.map((parent) => [inputParentKey(parent), parent]),
  )
  const incidents: PreparedIncidentPublicationClosure[] = []
  const maintenance: PreparedMaintenancePublicationClosure[] = []

  for (const parent of discovered) {
    const guard = guardByKey.get(parentKey(parent))
    if (!guard) throw invalidComponentState()

    if (guard.kind === "incident") {
      incidents.push(
        await prepareIncidentPublicationClosure(
          transaction,
          {
            incidentId: guard.incidentId,
            expectedIncidentVersion: guard.expectedIncidentVersion,
            expectedIncidentPublicationVersion:
              guard.expectedIncidentPublicationVersion,
          },
          input.action,
        ),
      )
    } else {
      maintenance.push(
        await prepareMaintenancePublicationClosure(
          transaction,
          {
            maintenanceWindowId: guard.maintenanceWindowId,
            expectedMaintenanceVersion: guard.expectedMaintenanceVersion,
            expectedMaintenancePublicationVersion:
              guard.expectedMaintenancePublicationVersion,
          },
          input.action,
          recordedAt,
        ),
      )
    }
  }

  return { incidents, maintenance }
}

async function readComponentGuardState(
  transaction: StatementExecutor,
  componentId: string,
): Promise<ComponentGuardState> {
  const result = await transaction.execute({
    sql: `
      SELECT
        components.id,
        components.public_id,
        components.version,
        COALESCE((
          SELECT publication_version
          FROM publication_events
          WHERE stream_type = 'component_metadata'
            AND stream_id = components.id
          ORDER BY publication_version DESC, id DESC
          LIMIT 1
        ), 0) AS metadata_publication_version
      FROM components
      WHERE components.id = ?
      LIMIT 1
    `,
    args: [componentId],
  })
  const row = result.rows[0]
  if (!row) {
    throw new CommandNotFoundError(
      "COMPONENT_NOT_FOUND",
      "An affected component does not exist",
    )
  }
  const parsed = z
    .object({
      id: z.uuid(),
      public_id: z.uuid(),
      version: z.number().int().positive().safe(),
      metadata_publication_version: z
        .number()
        .int()
        .nonnegative()
        .safe(),
    })
    .strict()
    .safeParse(row)
  if (!parsed.success) throw invalidComponentState()

  return {
    componentId: parsed.data.id,
    publicId: parsed.data.public_id,
    version: parsed.data.version,
    metadataPublicationVersion:
      parsed.data.metadata_publication_version,
  }
}

function dependencyPublicIds(
  incidents: readonly PreparedIncidentPublicationClosure[],
  maintenance: readonly PreparedMaintenancePublicationClosure[],
) {
  const result = new Map<string, string>()

  for (const plan of [...incidents, ...maintenance]) {
    for (const dependency of plan.dependencies) {
      const existing = result.get(dependency.componentId)
      if (existing && existing !== dependency.componentPublicId) {
        throw invalidPublicSnapshot()
      }
      result.set(dependency.componentId, dependency.componentPublicId)
    }
  }

  return result
}

async function validateComponentGuards(
  transaction: StatementExecutor,
  input: CloseComponentPublicationInput,
  prepared: {
    incidents: readonly PreparedIncidentPublicationClosure[]
    maintenance: readonly PreparedMaintenancePublicationClosure[]
  },
) {
  const publicIds = dependencyPublicIds(
    prepared.incidents,
    prepared.maintenance,
  )
  const expectedRelatedIds = [...publicIds.keys()]
    .filter((componentId) => componentId !== input.componentId)
    .toSorted((left, right) => left.localeCompare(right))
  const reviewedRelatedIds = input.relatedComponents.map(
    (component) => component.componentId,
  )

  if (
    expectedRelatedIds.length !== reviewedRelatedIds.length ||
    expectedRelatedIds.some(
      (componentId, index) => componentId !== reviewedRelatedIds[index],
    )
  ) {
    throw new CommandConflictError(
      "COMPONENT_PRIVACY_REVIEW_CONFLICT",
      "Affected components changed after the privacy action was reviewed",
    )
  }

  const relatedById = new Map(
    input.relatedComponents.map((component) => [
      component.componentId,
      component,
    ]),
  )
  const states = new Map<string, ComponentGuardState>()
  const targetState = await readComponentGuardState(
    transaction,
    input.componentId,
  )
  if (
    targetState.version !== input.expectedComponentVersion ||
    targetState.metadataPublicationVersion !==
      input.expectedMetadataPublicationVersion
  ) {
    throw new CommandConflictError(
      "COMPONENT_VERSION_CONFLICT",
      "The component changed after the privacy action was reviewed",
    )
  }
  const targetPublicId = publicIds.get(input.componentId)
  if (targetPublicId && targetPublicId !== targetState.publicId) {
    throw invalidPublicSnapshot()
  }
  states.set(input.componentId, targetState)

  for (const componentId of expectedRelatedIds) {
    const guard = relatedById.get(componentId)
    if (!guard) throw invalidComponentState()
    const state = await readComponentGuardState(transaction, componentId)
    if (
      state.version !== guard.expectedComponentVersion ||
      state.metadataPublicationVersion !==
        guard.expectedComponentMetadataPublicationVersion
    ) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "An affected component changed after the privacy action was reviewed",
      )
    }
    if (publicIds.get(componentId) !== state.publicId) {
      throw invalidPublicSnapshot()
    }
    states.set(componentId, state)
  }

  return states
}

function buildComponentVersionDeltas(
  targetComponentId: string,
  prepared: {
    incidents: readonly PreparedIncidentPublicationClosure[]
    maintenance: readonly PreparedMaintenancePublicationClosure[]
  },
) {
  const deltas = new Map<string, number>([[targetComponentId, 1]])

  for (const plan of [...prepared.incidents, ...prepared.maintenance]) {
    for (const dependency of plan.dependencies) {
      deltas.set(
        dependency.componentId,
        (deltas.get(dependency.componentId) ?? 0) + 1,
      )
    }
  }

  return deltas
}

async function updateComponentVersions(
  transaction: StatementExecutor,
  states: ReadonlyMap<string, ComponentGuardState>,
  deltas: ReadonlyMap<string, number>,
  recordedAt: number,
) {
  const results: Array<{
    componentId: string
    componentVersion: number
  }> = []

  for (const componentId of [...deltas.keys()].toSorted()) {
    const state = states.get(componentId)
    const delta = deltas.get(componentId)
    if (!state || !delta) throw invalidComponentState()

    const nextVersion = state.version + delta
    const result = await transaction.execute({
      sql: "UPDATE components SET version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING version",
      args: [nextVersion, recordedAt, componentId, state.version],
    })
    if (!result.rows[0]) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "An affected component changed during the privacy action",
      )
    }

    results.push({ componentId, componentVersion: nextVersion })
  }

  return results
}

async function insertComponentPublicationClosureEvents(
  transaction: StatementExecutor,
  prepared: PreparedComponentClosure,
  input: {
    action: CloseComponentPublicationInput["action"]
    allocation: PublicationEventAllocationSlice
    recordedAt: number
    correlationId: string
  },
) {
  const withdrawalEntryId =
    input.action === "withdraw" ? randomUUID() : null

  for (const [index, source] of prepared.metadataTargets.entries()) {
    const isWithdrawalTimeline =
      input.action === "withdraw" &&
      withdrawalEntryId !== null &&
      index === prepared.metadataTargets.length - 1
    const timelineSnapshot = isWithdrawalTimeline
      ? createWithdrawnTimelineSnapshot({
          schemaVersion: 1,
          kind: "withdrawn",
          publicEntryId: withdrawalEntryId,
        })
      : null

    await transaction.execute({
      sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, timeline_entry_id, timeline_effective_at, timeline_recorded_at, timeline_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'component_metadata', ?, ?, ?, 'component_revision', ?, ?, ?, 'closed', NULL, NULL, NULL, NULL, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
      args: [
        randomUUID(),
        prepared.root.componentId,
        prepared.metadataHead.version + index + 1,
        input.action,
        source.sourceId,
        source.sourceRevision,
        input.action === "suppress"
          ? null
          : JSON.stringify(source.snapshot),
        isWithdrawalTimeline ? withdrawalEntryId : null,
        isWithdrawalTimeline ? input.recordedAt : null,
        isWithdrawalTimeline ? input.recordedAt : null,
        timelineSnapshot === null ? null : JSON.stringify(timelineSnapshot),
        input.recordedAt,
        input.allocation.firstOwnerOrdinal + index,
        input.allocation.firstPublicOrdinal + index,
        input.allocation.publicPrivacyEpoch,
        input.correlationId,
      ],
    })
  }

  const statusOffset = prepared.metadataTargets.length
  for (const [index, source] of prepared.statusTargets.entries()) {
    const timelineSnapshot =
      input.action === "redact"
        ? createRedactedTimelineSnapshot({
            schemaVersion: 1,
            kind: "redacted",
            publicEntryId: source.publicEntryId,
          })
        : null

    await transaction.execute({
      sql: "INSERT INTO publication_events (id, stream_type, stream_id, publication_version, action, target_source_type, target_source_id, target_source_revision, target_snapshot_json, resulting_disposition, resulting_source_type, resulting_source_id, resulting_source_revision, resulting_current_snapshot_json, timeline_entry_id, timeline_effective_at, timeline_recorded_at, timeline_snapshot_json, snapshot_schema_version, recorded_at, owner_ordinal, public_ordinal, public_privacy_epoch, correlation_id) VALUES (?, 'component_status', ?, ?, ?, 'status_transition', ?, ?, ?, 'closed', NULL, NULL, NULL, NULL, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)",
      args: [
        randomUUID(),
        prepared.root.componentId,
        prepared.statusHead.version + index + 1,
        input.action,
        source.sourceId,
        source.sourceRevision,
        input.action === "suppress"
          ? null
          : JSON.stringify(source.snapshot),
        input.action === "redact" ? source.publicEntryId : null,
        input.action === "redact" ? source.effectiveAt : null,
        input.action === "redact" ? source.recordedAt : null,
        timelineSnapshot === null ? null : JSON.stringify(timelineSnapshot),
        input.recordedAt,
        input.allocation.firstOwnerOrdinal + statusOffset + index,
        input.allocation.firstPublicOrdinal + statusOffset + index,
        input.allocation.publicPrivacyEpoch,
        input.correlationId,
      ],
    })
  }

  return {
    metadataPublicationVersion:
      prepared.metadataHead.version + prepared.metadataTargets.length,
    statusPublicationVersion:
      prepared.statusHead.version + prepared.statusTargets.length,
  }
}

function allocationSlice(
  allocation: {
    firstOwnerOrdinal: number
    firstPublicOrdinal: number
    publicPrivacyEpoch: number
  },
  offset: number,
): PublicationEventAllocationSlice {
  return {
    firstOwnerOrdinal: allocation.firstOwnerOrdinal + offset,
    firstPublicOrdinal: allocation.firstPublicOrdinal + offset,
    publicPrivacyEpoch: allocation.publicPrivacyEpoch,
  }
}

export async function closeComponentPublicationForOwner(
  connection: DatabaseConnection,
  owner: OwnerIdentity,
  rawInput: unknown,
): Promise<CloseComponentPublicationResult> {
  const input = normalizeInput(
    closeComponentPublicationInputSchema.parse(rawInput),
  )
  const payloadHash = hashCommandPayload(input)
  const recordedAt = Date.now()
  const correlationId = randomUUID()

  return withWriteTransaction(connection, async (transaction) => {
    const existingResultRef = await readCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "close_component_publication",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
    })
    if (existingResultRef) return parseResult(existingResultRef)

    const root = await readComponentRoot(transaction, input.componentId)
    if (root.version !== input.expectedComponentVersion) {
      throw new CommandConflictError(
        "COMPONENT_VERSION_CONFLICT",
        "The component changed after the privacy action was prepared",
      )
    }
    const metadataHead = await readPublicationHead(
      transaction,
      "component_metadata",
      input.componentId,
    )
    const statusHead = await readPublicationHead(
      transaction,
      "component_status",
      input.componentId,
    )
    if (
      metadataHead.version !== input.expectedMetadataPublicationVersion
    ) {
      throw new CommandConflictError(
        "COMPONENT_PUBLICATION_VERSION_CONFLICT",
        "The component metadata publication changed after review",
      )
    }
    if (statusHead.version !== input.expectedStatusPublicationVersion) {
      throw new CommandConflictError(
        "STATUS_PUBLICATION_VERSION_CONFLICT",
        "The component status publication changed after review",
      )
    }

    const ownClosure = prepareOwnClosureTargets(
      root,
      metadataHead,
      statusHead,
      await readMetadataSources(transaction, root),
      await readStatusSources(transaction, root),
      input.action,
    )
    const discoveredParents = await readComponentPrivacyParents(
      transaction,
      input.componentId,
      input.action,
    )
    assertParentReview(input, discoveredParents)
    const parentClosures = await prepareParentClosures(
      transaction,
      input,
      discoveredParents,
      recordedAt,
    )
    const componentStates = await validateComponentGuards(
      transaction,
      input,
      parentClosures,
    )
    const versionDeltas = buildComponentVersionDeltas(
      input.componentId,
      parentClosures,
    )
    const componentVersions = await updateComponentVersions(
      transaction,
      componentStates,
      versionDeltas,
      recordedAt,
    )

    const parentEventCount =
      parentClosures.incidents.reduce(
        (count, plan) => count + plan.targets.length,
        0,
      ) +
      parentClosures.maintenance.reduce(
        (count, plan) => count + plan.targets.length,
        0,
      )
    const ownEventCount =
      ownClosure.metadataTargets.length + ownClosure.statusTargets.length
    const totalEventCount = parentEventCount + ownEventCount
    const allocation = await allocateOrdinals(
      transaction,
      totalEventCount,
      totalEventCount,
      recordedAt,
      input.action === "withdraw" ? 0 : 1,
    )
    const batchAllocation = {
      firstOwnerOrdinal:
        allocation.ownerOrdinal - totalEventCount + 1,
      firstPublicOrdinal:
        allocation.publicOrdinal - totalEventCount + 1,
      publicPrivacyEpoch: allocation.publicPrivacyEpoch,
    }
    const parentPublications: Array<
      CloseComponentPublicationResult["parentPublications"][number]
    > = []
    let offset = 0

    for (const plan of parentClosures.incidents) {
      const incidentPublicationVersion =
        await insertIncidentPublicationClosureEvents(transaction, plan, {
          action: input.action,
          allocation: allocationSlice(batchAllocation, offset),
          recordedAt,
          correlationId,
        })
      offset += plan.targets.length
      parentPublications.push({
        kind: "incident",
        incidentId: plan.incidentId,
        incidentPublicationVersion,
      })
    }

    for (const plan of parentClosures.maintenance) {
      const closure = await insertMaintenancePublicationClosureEvents(
        transaction,
        plan,
        {
          action: input.action,
          allocation: allocationSlice(batchAllocation, offset),
          recordedAt,
          correlationId,
        },
      )
      offset += plan.targets.length
      parentPublications.push({
        kind: "maintenance",
        maintenanceWindowId: plan.maintenanceWindowId,
        maintenancePublicationVersion:
          closure.maintenancePublicationVersion,
      })
    }

    const ownResult = await insertComponentPublicationClosureEvents(
      transaction,
      ownClosure,
      {
        action: input.action,
        allocation: allocationSlice(batchAllocation, offset),
        recordedAt,
        correlationId,
      },
    )
    const targetVersion = componentVersions.find(
      (component) => component.componentId === input.componentId,
    )?.componentVersion
    if (!targetVersion) throw invalidComponentState()

    const result: CloseComponentPublicationResult = {
      componentId: input.componentId,
      componentVersion: targetVersion,
      metadataPublicationVersion: ownResult.metadataPublicationVersion,
      statusPublicationVersion: ownResult.statusPublicationVersion,
      publicPrivacyEpoch: allocation.publicPrivacyEpoch,
      componentVersions,
      parentPublications,
    }
    await writeCommandReceipt(transaction, {
      ownerKey: owner.ownerKey,
      action: "close_component_publication",
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      resultRef: JSON.stringify(result),
      recordedAt,
      responseTtlMs: 86_400_000,
    })

    return result
  })
}
