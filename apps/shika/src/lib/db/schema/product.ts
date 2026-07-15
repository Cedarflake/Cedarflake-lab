import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" })
const json = (name: string) => text(name, { mode: "json" }).$type<unknown>()

export const timelineClock = sqliteTable(
  "timeline_clock",
  {
    id: integer("id").primaryKey(),
    ownerOrdinal: integer("owner_ordinal").notNull().default(0),
    publicOrdinal: integer("public_ordinal").notNull().default(0),
    publicPrivacyEpoch: integer("public_privacy_epoch").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    check("timeline_clock_singleton_ck", sql`${table.id} = 1`),
    check("timeline_clock_owner_ordinal_ck", sql`${table.ownerOrdinal} >= 0`),
    check("timeline_clock_public_ordinal_ck", sql`${table.publicOrdinal} >= 0`),
    check(
      "timeline_clock_privacy_epoch_ck",
      sql`${table.publicPrivacyEpoch} >= 0`,
    ),
  ],
)

export const siteProfile = sqliteTable(
  "site_profile",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    check("site_profile_singleton_ck", sql`${table.id} = 'site'`),
    check("site_profile_version_ck", sql`${table.version} >= 1`),
    check(
      "site_profile_timestamp_order_ck",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
)

export const siteProfileRevisions = sqliteTable(
  "site_profile_revisions",
  {
    id: text("id").primaryKey(),
    siteProfileId: text("site_profile_id")
      .notNull()
      .references(() => siteProfile.id, { onDelete: "restrict" }),
    siteProfileVersion: integer("site_profile_version").notNull(),
    ownerTitle: text("owner_title").notNull(),
    ownerSummary: text("owner_summary"),
    publicTitle: text("public_title"),
    publicSummary: text("public_summary"),
    timezone: text("timezone").notNull(),
    privateNote: text("private_note"),
    recordedAt: timestamp("recorded_at").notNull(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("site_profile_revisions_version_uidx").on(
      table.siteProfileId,
      table.siteProfileVersion,
    ),
    index("site_profile_revisions_latest_idx").on(
      table.siteProfileId,
      table.siteProfileVersion,
    ),
    check(
      "site_profile_revisions_version_ck",
      sql`${table.siteProfileVersion} >= 1`,
    ),
    check(
      "site_profile_revisions_public_copy_ck",
      sql`${table.publicTitle} IS NOT NULL OR ${table.publicSummary} IS NULL`,
    ),
  ],
)

export const components = sqliteTable(
  "components",
  {
    id: text("id").primaryKey(),
    publicId: text("public_id").notNull().unique(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    check("components_version_ck", sql`${table.version} >= 1`),
    check(
      "components_timestamp_order_ck",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
)

export const componentRevisions = sqliteTable(
  "component_revisions",
  {
    id: text("id").primaryKey(),
    componentId: text("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "restrict" }),
    componentVersion: integer("component_version").notNull(),
    lifecycle: text("lifecycle", { enum: ["active", "archived"] }).notNull(),
    ownerName: text("owner_name").notNull(),
    ownerSummary: text("owner_summary"),
    ownerSortOrder: integer("owner_sort_order").notNull(),
    publicName: text("public_name"),
    publicSummary: text("public_summary"),
    publicSortOrder: integer("public_sort_order"),
    defaultValidityMs: integer("default_validity_ms"),
    privateNote: text("private_note"),
    recordedAt: timestamp("recorded_at").notNull(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("component_revisions_version_uidx").on(
      table.componentId,
      table.componentVersion,
    ),
    index("component_revisions_latest_idx").on(
      table.componentId,
      table.componentVersion,
    ),
    check(
      "component_revisions_version_ck",
      sql`${table.componentVersion} >= 1`,
    ),
    check(
      "component_revisions_lifecycle_ck",
      sql`${table.lifecycle} IN ('active', 'archived')`,
    ),
    check(
      "component_revisions_owner_sort_order_ck",
      sql`${table.ownerSortOrder} >= 0`,
    ),
    check(
      "component_revisions_public_sort_order_ck",
      sql`${table.publicSortOrder} IS NULL OR ${table.publicSortOrder} >= 0`,
    ),
    check(
      "component_revisions_default_validity_ck",
      sql`${table.defaultValidityMs} IS NULL OR ${table.defaultValidityMs} > 0`,
    ),
    check(
      "component_revisions_public_identity_ck",
      sql`(${table.publicName} IS NULL AND ${table.publicSortOrder} IS NULL AND ${table.publicSummary} IS NULL) OR (${table.publicName} IS NOT NULL AND ${table.publicSortOrder} IS NOT NULL)`,
    ),
  ],
)

export const statusTransitions = sqliteTable(
  "status_transitions",
  {
    id: text("id").primaryKey(),
    componentId: text("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "restrict" }),
    componentVersion: integer("component_version").notNull(),
    condition: text("condition", {
      enum: ["available", "limited", "degraded", "unavailable"],
    }).notNull(),
    ownerSummary: text("owner_summary"),
    publicSummary: text("public_summary"),
    privateNote: text("private_note"),
    effectiveAt: timestamp("effective_at").notNull(),
    validUntil: timestamp("valid_until"),
    recordedAt: timestamp("recorded_at").notNull(),
    ownerOrdinal: integer("owner_ordinal").notNull(),
    publicEntryId: text("public_entry_id").notNull().unique(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("status_transitions_component_version_uidx").on(
      table.componentId,
      table.componentVersion,
    ),
    uniqueIndex("status_transitions_owner_ordinal_uidx").on(table.ownerOrdinal),
    index("status_transitions_current_idx").on(
      table.componentId,
      table.effectiveAt,
      table.recordedAt,
      table.ownerOrdinal,
      table.id,
    ),
    index("status_transitions_timeline_idx").on(
      table.effectiveAt,
      table.recordedAt,
      table.ownerOrdinal,
      table.id,
    ),
    check(
      "status_transitions_version_ck",
      sql`${table.componentVersion} >= 1`,
    ),
    check(
      "status_transitions_condition_ck",
      sql`${table.condition} IN ('available', 'limited', 'degraded', 'unavailable')`,
    ),
    check(
      "status_transitions_interval_ck",
      sql`${table.validUntil} IS NULL OR ${table.validUntil} > ${table.effectiveAt}`,
    ),
    check(
      "status_transitions_owner_ordinal_ck",
      sql`${table.ownerOrdinal} > 0`,
    ),
  ],
)

export const incidents = sqliteTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    publicId: text("public_id").notNull().unique(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    check("incidents_version_ck", sql`${table.version} >= 1`),
    check(
      "incidents_timestamp_order_ck",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
)

export const incidentUpdates = sqliteTable(
  "incident_updates",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "restrict" }),
    incidentVersion: integer("incident_version").notNull(),
    kind: text("kind", {
      enum: ["created", "note", "phase", "metadata", "resolved", "reopened"],
    }).notNull(),
    phase: text("phase", {
      enum: ["investigating", "identified", "monitoring", "resolved"],
    }).notNull(),
    severity: text("severity", { enum: ["minor", "major", "critical"] }).notNull(),
    title: text("title").notNull(),
    ownerSummary: text("owner_summary"),
    privateNote: text("private_note"),
    reason: text("reason"),
    publicTitle: text("public_title"),
    publicPhase: text("public_phase", {
      enum: ["investigating", "identified", "monitoring", "resolved"],
    }),
    publicSeverity: text("public_severity", {
      enum: ["minor", "major", "critical"],
    }),
    publicSummary: text("public_summary"),
    effectiveAt: timestamp("effective_at").notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
    ownerOrdinal: integer("owner_ordinal").notNull(),
    publicEntryId: text("public_entry_id").notNull().unique(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("incident_updates_version_uidx").on(
      table.incidentId,
      table.incidentVersion,
    ),
    uniqueIndex("incident_updates_owner_ordinal_uidx").on(table.ownerOrdinal),
    index("incident_updates_latest_idx").on(
      table.incidentId,
      table.incidentVersion,
    ),
    index("incident_updates_timeline_idx").on(
      table.effectiveAt,
      table.recordedAt,
      table.ownerOrdinal,
      table.id,
    ),
    check("incident_updates_version_ck", sql`${table.incidentVersion} >= 1`),
    check(
      "incident_updates_kind_ck",
      sql`${table.kind} IN ('created', 'note', 'phase', 'metadata', 'resolved', 'reopened')`,
    ),
    check(
      "incident_updates_phase_ck",
      sql`${table.phase} IN ('investigating', 'identified', 'monitoring', 'resolved')`,
    ),
    check(
      "incident_updates_severity_ck",
      sql`${table.severity} IN ('minor', 'major', 'critical')`,
    ),
    check(
      "incident_updates_public_snapshot_ck",
      sql`(${table.publicTitle} IS NULL AND ${table.publicPhase} IS NULL AND ${table.publicSeverity} IS NULL AND ${table.publicSummary} IS NULL) OR (${table.publicTitle} IS NOT NULL AND ${table.publicPhase} IS NOT NULL AND ${table.publicSeverity} IS NOT NULL)`,
    ),
    check(
      "incident_updates_resolved_kind_ck",
      sql`${table.kind} != 'resolved' OR ${table.phase} = 'resolved'`,
    ),
    check(
      "incident_updates_reopened_kind_ck",
      sql`${table.kind} != 'reopened' OR (${table.phase} = 'investigating' AND length(trim(${table.reason})) > 0)`,
    ),
    check("incident_updates_owner_ordinal_ck", sql`${table.ownerOrdinal} > 0`),
  ],
)

export const incidentUpdateComponents = sqliteTable(
  "incident_update_components",
  {
    incidentUpdateId: text("incident_update_id")
      .notNull()
      .references(() => incidentUpdates.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    componentId: text("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "restrict" }),
    componentVersion: integer("component_version").notNull(),
    componentRevisionId: text("component_revision_id")
      .notNull()
      .references(() => componentRevisions.id, { onDelete: "restrict" }),
    ownerNameSnapshot: text("owner_name_snapshot").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.incidentUpdateId, table.componentId] }),
    uniqueIndex("incident_update_components_position_uidx").on(
      table.incidentUpdateId,
      table.position,
    ),
    index("incident_update_components_dependency_idx").on(
      table.componentId,
      table.incidentUpdateId,
    ),
    check("incident_update_components_position_ck", sql`${table.position} >= 0`),
    check(
      "incident_update_components_version_ck",
      sql`${table.componentVersion} >= 1`,
    ),
  ],
)

export const incidentUpdatePublicComponents = sqliteTable(
  "incident_update_public_components",
  {
    incidentUpdateId: text("incident_update_id")
      .notNull()
      .references(() => incidentUpdates.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    componentId: text("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "restrict" }),
    publicComponentIdSnapshot: text("public_component_id_snapshot").notNull(),
    publicNameSnapshot: text("public_name_snapshot").notNull(),
    componentMetadataPublicationVersion: integer(
      "component_metadata_publication_version",
    ).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.incidentUpdateId, table.componentId] }),
    uniqueIndex("incident_update_public_components_position_uidx").on(
      table.incidentUpdateId,
      table.position,
    ),
    index("incident_update_public_components_dependency_idx").on(
      table.componentId,
      table.incidentUpdateId,
    ),
    check(
      "incident_update_public_components_position_ck",
      sql`${table.position} >= 0`,
    ),
    check(
      "incident_update_public_components_version_ck",
      sql`${table.componentMetadataPublicationVersion} > 0`,
    ),
  ],
)

export const maintenanceWindows = sqliteTable(
  "maintenance_windows",
  {
    id: text("id").primaryKey(),
    publicId: text("public_id").notNull().unique(),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    check("maintenance_windows_version_ck", sql`${table.version} >= 1`),
    check(
      "maintenance_windows_timestamp_order_ck",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
)

export const maintenanceEvents = sqliteTable(
  "maintenance_events",
  {
    id: text("id").primaryKey(),
    maintenanceWindowId: text("maintenance_window_id")
      .notNull()
      .references(() => maintenanceWindows.id, { onDelete: "restrict" }),
    maintenanceVersion: integer("maintenance_version").notNull(),
    kind: text("kind", {
      enum: [
        "scheduled",
        "rescheduled",
        "started",
        "completed",
        "cancelled",
        "note",
        "metadata",
      ],
    }).notNull(),
    phase: text("phase", {
      enum: ["scheduled", "in_progress", "completed", "cancelled"],
    }).notNull(),
    title: text("title").notNull(),
    ownerSummary: text("owner_summary"),
    privateNote: text("private_note"),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    timezone: text("timezone").notNull(),
    publicTitle: text("public_title"),
    publicPhase: text("public_phase", {
      enum: ["scheduled", "in_progress", "completed", "cancelled"],
    }),
    publicSummary: text("public_summary"),
    publicStartsAt: timestamp("public_starts_at"),
    publicEndsAt: timestamp("public_ends_at"),
    publicTimezone: text("public_timezone"),
    effectiveAt: timestamp("effective_at").notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
    ownerOrdinal: integer("owner_ordinal").notNull(),
    publicEntryId: text("public_entry_id").notNull().unique(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("maintenance_events_version_uidx").on(
      table.maintenanceWindowId,
      table.maintenanceVersion,
    ),
    uniqueIndex("maintenance_events_owner_ordinal_uidx").on(table.ownerOrdinal),
    index("maintenance_events_latest_idx").on(
      table.maintenanceWindowId,
      table.maintenanceVersion,
    ),
    index("maintenance_events_timeline_idx").on(
      table.effectiveAt,
      table.recordedAt,
      table.ownerOrdinal,
      table.id,
    ),
    check(
      "maintenance_events_version_ck",
      sql`${table.maintenanceVersion} >= 1`,
    ),
    check(
      "maintenance_events_kind_ck",
      sql`${table.kind} IN ('scheduled', 'rescheduled', 'started', 'completed', 'cancelled', 'note', 'metadata')`,
    ),
    check(
      "maintenance_events_phase_ck",
      sql`${table.phase} IN ('scheduled', 'in_progress', 'completed', 'cancelled')`,
    ),
    check(
      "maintenance_events_interval_ck",
      sql`${table.startsAt} < ${table.endsAt}`,
    ),
    check(
      "maintenance_events_public_snapshot_ck",
      sql`(${table.publicTitle} IS NULL AND ${table.publicPhase} IS NULL AND ${table.publicSummary} IS NULL AND ${table.publicStartsAt} IS NULL AND ${table.publicEndsAt} IS NULL AND ${table.publicTimezone} IS NULL) OR (${table.publicTitle} IS NOT NULL AND ${table.publicPhase} IS NOT NULL AND ${table.publicStartsAt} IS NOT NULL AND ${table.publicEndsAt} IS NOT NULL AND ${table.publicTimezone} IS NOT NULL AND ${table.publicStartsAt} < ${table.publicEndsAt})`,
    ),
    check("maintenance_events_owner_ordinal_ck", sql`${table.ownerOrdinal} > 0`),
  ],
)

export const maintenanceEventComponents = sqliteTable(
  "maintenance_event_components",
  {
    maintenanceEventId: text("maintenance_event_id")
      .notNull()
      .references(() => maintenanceEvents.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    componentId: text("component_id")
      .notNull()
      .references(() => components.id, { onDelete: "restrict" }),
    componentVersion: integer("component_version").notNull(),
    componentRevisionId: text("component_revision_id")
      .notNull()
      .references(() => componentRevisions.id, { onDelete: "restrict" }),
    ownerNameSnapshot: text("owner_name_snapshot").notNull(),
    publicComponentIdSnapshot: text("public_component_id_snapshot"),
    publicNameSnapshot: text("public_name_snapshot"),
    componentMetadataPublicationVersion: integer(
      "component_metadata_publication_version",
    ),
  },
  (table) => [
    primaryKey({ columns: [table.maintenanceEventId, table.componentId] }),
    uniqueIndex("maintenance_event_components_position_uidx").on(
      table.maintenanceEventId,
      table.position,
    ),
    index("maintenance_event_components_dependency_idx").on(
      table.componentId,
      table.maintenanceEventId,
    ),
    check("maintenance_event_components_position_ck", sql`${table.position} >= 0`),
    check(
      "maintenance_event_components_version_ck",
      sql`${table.componentVersion} >= 1`,
    ),
    check(
      "maintenance_event_components_public_snapshot_ck",
      sql`(${table.publicComponentIdSnapshot} IS NULL AND ${table.publicNameSnapshot} IS NULL AND ${table.componentMetadataPublicationVersion} IS NULL) OR (${table.publicComponentIdSnapshot} IS NOT NULL AND ${table.publicNameSnapshot} IS NOT NULL AND ${table.componentMetadataPublicationVersion} > 0)`,
    ),
  ],
)

export const publicationEvents = sqliteTable(
  "publication_events",
  {
    id: text("id").primaryKey(),
    streamType: text("stream_type", {
      enum: [
        "site_profile",
        "component_metadata",
        "component_status",
        "incident",
        "maintenance",
      ],
    }).notNull(),
    streamId: text("stream_id").notNull(),
    publicationVersion: integer("publication_version").notNull(),
    action: text("action", {
      enum: ["publish", "withdraw", "redact", "suppress"],
    }).notNull(),
    targetSourceType: text("target_source_type", {
      enum: [
        "site_profile_revision",
        "component_revision",
        "status_transition",
        "incident_update",
        "maintenance_event",
      ],
    }).notNull(),
    targetSourceId: text("target_source_id").notNull(),
    targetSourceRevision: integer("target_source_revision").notNull(),
    targetSnapshotJson: json("target_snapshot_json"),
    resultingDisposition: text("resulting_disposition", {
      enum: ["published", "closed"],
    }).notNull(),
    resultingSourceType: text("resulting_source_type"),
    resultingSourceId: text("resulting_source_id"),
    resultingSourceRevision: integer("resulting_source_revision"),
    resultingCurrentSnapshotJson: json("resulting_current_snapshot_json"),
    timelineEntryId: text("timeline_entry_id"),
    timelineEffectiveAt: timestamp("timeline_effective_at"),
    timelineRecordedAt: timestamp("timeline_recorded_at"),
    timelineSnapshotJson: json("timeline_snapshot_json"),
    snapshotSchemaVersion: integer("snapshot_schema_version").notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
    ownerOrdinal: integer("owner_ordinal").notNull(),
    publicOrdinal: integer("public_ordinal").notNull(),
    publicPrivacyEpoch: integer("public_privacy_epoch").notNull(),
    correlationId: text("correlation_id").notNull(),
  },
  (table) => [
    uniqueIndex("publication_events_stream_version_uidx").on(
      table.streamType,
      table.streamId,
      table.publicationVersion,
    ),
    uniqueIndex("publication_events_owner_ordinal_uidx").on(table.ownerOrdinal),
    uniqueIndex("publication_events_public_ordinal_uidx").on(table.publicOrdinal),
    index("publication_events_latest_stream_idx").on(
      table.streamType,
      table.streamId,
      table.publicationVersion,
    ),
    index("publication_events_source_state_idx").on(
      table.targetSourceType,
      table.targetSourceId,
      table.publicationVersion,
    ),
    index("publication_events_timeline_state_idx").on(
      table.timelineEntryId,
      table.publicOrdinal,
    ),
    index("publication_events_timeline_order_idx").on(
      table.timelineEffectiveAt,
      table.timelineRecordedAt,
      table.publicOrdinal,
      table.timelineEntryId,
    ),
    check(
      "publication_events_version_ck",
      sql`${table.publicationVersion} > 0`,
    ),
    check(
      "publication_events_target_revision_ck",
      sql`${table.targetSourceRevision} > 0`,
    ),
    check(
      "publication_events_snapshot_version_ck",
      sql`${table.snapshotSchemaVersion} > 0`,
    ),
    check("publication_events_owner_ordinal_ck", sql`${table.ownerOrdinal} > 0`),
    check("publication_events_public_ordinal_ck", sql`${table.publicOrdinal} > 0`),
    check(
      "publication_events_privacy_epoch_ck",
      sql`${table.publicPrivacyEpoch} >= 0`,
    ),
    check(
      "publication_events_stream_source_ck",
      sql`(${table.streamType} = 'site_profile' AND ${table.targetSourceType} = 'site_profile_revision') OR (${table.streamType} = 'component_metadata' AND ${table.targetSourceType} = 'component_revision') OR (${table.streamType} = 'component_status' AND ${table.targetSourceType} = 'status_transition') OR (${table.streamType} = 'incident' AND ${table.targetSourceType} = 'incident_update') OR (${table.streamType} = 'maintenance' AND ${table.targetSourceType} = 'maintenance_event')`,
    ),
    check(
      "publication_events_target_snapshot_ck",
      sql`(${table.action} = 'suppress' AND ${table.targetSnapshotJson} IS NULL AND ${table.timelineSnapshotJson} IS NULL) OR (${table.action} != 'suppress' AND ${table.targetSnapshotJson} IS NOT NULL)`,
    ),
    check(
      "publication_events_result_snapshot_ck",
      sql`(${table.resultingDisposition} = 'published' AND ${table.resultingSourceType} IS NOT NULL AND ${table.resultingSourceId} IS NOT NULL AND ${table.resultingSourceRevision} > 0 AND ${table.resultingCurrentSnapshotJson} IS NOT NULL) OR (${table.resultingDisposition} = 'closed' AND ${table.resultingSourceType} IS NULL AND ${table.resultingSourceId} IS NULL AND ${table.resultingSourceRevision} IS NULL AND ${table.resultingCurrentSnapshotJson} IS NULL)`,
    ),
    check(
      "publication_events_timeline_snapshot_ck",
      sql`(${table.timelineEntryId} IS NULL AND ${table.timelineEffectiveAt} IS NULL AND ${table.timelineRecordedAt} IS NULL AND ${table.timelineSnapshotJson} IS NULL) OR (${table.timelineEntryId} IS NOT NULL AND ${table.timelineEffectiveAt} IS NOT NULL AND ${table.timelineRecordedAt} IS NOT NULL)`,
    ),
  ],
)

export const commandReceipts = sqliteTable(
  "command_receipts",
  {
    ownerKey: text("owner_key").notNull(),
    action: text("action").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    resultRef: text("result_ref").notNull(),
    responseBodyJson: json("response_body_json"),
    responseExpiresAt: timestamp("response_expires_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.ownerKey, table.action, table.idempotencyKey],
    }),
    index("command_receipts_response_expiry_idx")
      .on(table.responseExpiresAt)
      .where(sql`${table.responseBodyJson} IS NOT NULL`),
    check(
      "command_receipts_owner_key_ck",
      sql`${table.ownerKey} GLOB 'github:[1-9]*' AND substr(${table.ownerKey}, 8) NOT GLOB '*[^0-9]*'`,
    ),
    check(
      "command_receipts_payload_hash_ck",
      sql`length(${table.payloadHash}) = 64 AND ${table.payloadHash} NOT GLOB '*[^0-9a-f]*'`,
    ),
    check(
      "command_receipts_response_expiry_ck",
      sql`${table.responseExpiresAt} IS NULL OR ${table.responseExpiresAt} > ${table.createdAt}`,
    ),
  ],
)
