CREATE TABLE `auth_account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_account_user_id_idx` ON `auth_account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `auth_account_provider_account_uidx` ON `auth_account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE TABLE `auth_rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_rate_limit_key_unique` ON `auth_rate_limit` (`key`);--> statement-breakpoint
CREATE TABLE `auth_session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_session_token_unique` ON `auth_session` (`token`);--> statement-breakpoint
CREATE INDEX `auth_session_user_id_idx` ON `auth_session` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_user_email_unique` ON `auth_user` (`email`);--> statement-breakpoint
CREATE TABLE `auth_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verification_identifier_idx` ON `auth_verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `command_receipts` (
	`owner_key` text NOT NULL,
	`action` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`result_ref` text NOT NULL,
	`response_body_json` text,
	`response_expires_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_key`, `action`, `idempotency_key`),
	CONSTRAINT "command_receipts_owner_key_ck" CHECK("command_receipts"."owner_key" GLOB 'github:[1-9][0-9]*'),
	CONSTRAINT "command_receipts_payload_hash_ck" CHECK(length("command_receipts"."payload_hash") = 64 AND "command_receipts"."payload_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "command_receipts_response_expiry_ck" CHECK("command_receipts"."response_expires_at" IS NULL OR "command_receipts"."response_expires_at" > "command_receipts"."created_at")
);
--> statement-breakpoint
CREATE INDEX `command_receipts_response_expiry_idx` ON `command_receipts` (`response_expires_at`) WHERE "command_receipts"."response_body_json" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `component_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`component_id` text NOT NULL,
	`component_version` integer NOT NULL,
	`lifecycle` text NOT NULL,
	`owner_name` text NOT NULL,
	`owner_summary` text,
	`owner_sort_order` integer NOT NULL,
	`public_name` text,
	`public_summary` text,
	`public_sort_order` integer,
	`default_validity_ms` integer,
	`private_note` text,
	`recorded_at` integer NOT NULL,
	`correlation_id` text NOT NULL,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "component_revisions_version_ck" CHECK("component_revisions"."component_version" >= 1),
	CONSTRAINT "component_revisions_lifecycle_ck" CHECK("component_revisions"."lifecycle" IN ('active', 'archived')),
	CONSTRAINT "component_revisions_owner_sort_order_ck" CHECK("component_revisions"."owner_sort_order" >= 0),
	CONSTRAINT "component_revisions_public_sort_order_ck" CHECK("component_revisions"."public_sort_order" IS NULL OR "component_revisions"."public_sort_order" >= 0),
	CONSTRAINT "component_revisions_default_validity_ck" CHECK("component_revisions"."default_validity_ms" IS NULL OR "component_revisions"."default_validity_ms" > 0),
	CONSTRAINT "component_revisions_public_identity_ck" CHECK(("component_revisions"."public_name" IS NULL AND "component_revisions"."public_sort_order" IS NULL AND "component_revisions"."public_summary" IS NULL) OR ("component_revisions"."public_name" IS NOT NULL AND "component_revisions"."public_sort_order" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `component_revisions_version_uidx` ON `component_revisions` (`component_id`,`component_version`);--> statement-breakpoint
CREATE INDEX `component_revisions_latest_idx` ON `component_revisions` (`component_id`,`component_version`);--> statement-breakpoint
CREATE TABLE `components` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "components_version_ck" CHECK("components"."version" >= 1),
	CONSTRAINT "components_timestamp_order_ck" CHECK("components"."updated_at" >= "components"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `components_public_id_unique` ON `components` (`public_id`);--> statement-breakpoint
CREATE TABLE `incident_update_components` (
	`incident_update_id` text NOT NULL,
	`position` integer NOT NULL,
	`component_id` text NOT NULL,
	`component_version` integer NOT NULL,
	`component_revision_id` text NOT NULL,
	`owner_name_snapshot` text NOT NULL,
	`public_component_id_snapshot` text,
	`public_name_snapshot` text,
	`component_metadata_publication_version` integer,
	PRIMARY KEY(`incident_update_id`, `component_id`),
	FOREIGN KEY (`incident_update_id`) REFERENCES `incident_updates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`component_revision_id`) REFERENCES `component_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "incident_update_components_position_ck" CHECK("incident_update_components"."position" >= 0),
	CONSTRAINT "incident_update_components_version_ck" CHECK("incident_update_components"."component_version" >= 1),
	CONSTRAINT "incident_update_components_public_snapshot_ck" CHECK(("incident_update_components"."public_component_id_snapshot" IS NULL AND "incident_update_components"."public_name_snapshot" IS NULL AND "incident_update_components"."component_metadata_publication_version" IS NULL) OR ("incident_update_components"."public_component_id_snapshot" IS NOT NULL AND "incident_update_components"."public_name_snapshot" IS NOT NULL AND "incident_update_components"."component_metadata_publication_version" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `incident_update_components_position_uidx` ON `incident_update_components` (`incident_update_id`,`position`);--> statement-breakpoint
CREATE INDEX `incident_update_components_dependency_idx` ON `incident_update_components` (`component_id`,`incident_update_id`);--> statement-breakpoint
CREATE TABLE `incident_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`incident_version` integer NOT NULL,
	`kind` text NOT NULL,
	`phase` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`owner_summary` text,
	`private_note` text,
	`reason` text,
	`public_title` text,
	`public_phase` text,
	`public_severity` text,
	`public_summary` text,
	`effective_at` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	`owner_ordinal` integer NOT NULL,
	`public_entry_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "incident_updates_version_ck" CHECK("incident_updates"."incident_version" >= 1),
	CONSTRAINT "incident_updates_kind_ck" CHECK("incident_updates"."kind" IN ('created', 'note', 'phase', 'metadata', 'resolved', 'reopened')),
	CONSTRAINT "incident_updates_phase_ck" CHECK("incident_updates"."phase" IN ('investigating', 'identified', 'monitoring', 'resolved')),
	CONSTRAINT "incident_updates_severity_ck" CHECK("incident_updates"."severity" IN ('minor', 'major', 'critical')),
	CONSTRAINT "incident_updates_public_snapshot_ck" CHECK(("incident_updates"."public_title" IS NULL AND "incident_updates"."public_phase" IS NULL AND "incident_updates"."public_severity" IS NULL AND "incident_updates"."public_summary" IS NULL) OR ("incident_updates"."public_title" IS NOT NULL AND "incident_updates"."public_phase" IS NOT NULL AND "incident_updates"."public_severity" IS NOT NULL)),
	CONSTRAINT "incident_updates_resolved_kind_ck" CHECK("incident_updates"."kind" != 'resolved' OR "incident_updates"."phase" = 'resolved'),
	CONSTRAINT "incident_updates_reopened_kind_ck" CHECK("incident_updates"."kind" != 'reopened' OR ("incident_updates"."phase" = 'investigating' AND length(trim("incident_updates"."reason")) > 0)),
	CONSTRAINT "incident_updates_owner_ordinal_ck" CHECK("incident_updates"."owner_ordinal" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `incident_updates_public_entry_id_unique` ON `incident_updates` (`public_entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `incident_updates_version_uidx` ON `incident_updates` (`incident_id`,`incident_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `incident_updates_owner_ordinal_uidx` ON `incident_updates` (`owner_ordinal`);--> statement-breakpoint
CREATE INDEX `incident_updates_latest_idx` ON `incident_updates` (`incident_id`,`incident_version`);--> statement-breakpoint
CREATE INDEX `incident_updates_timeline_idx` ON `incident_updates` (`effective_at`,`recorded_at`,`owner_ordinal`,`id`);--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "incidents_version_ck" CHECK("incidents"."version" >= 1),
	CONSTRAINT "incidents_timestamp_order_ck" CHECK("incidents"."updated_at" >= "incidents"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `incidents_public_id_unique` ON `incidents` (`public_id`);--> statement-breakpoint
CREATE TABLE `maintenance_event_components` (
	`maintenance_event_id` text NOT NULL,
	`position` integer NOT NULL,
	`component_id` text NOT NULL,
	`component_version` integer NOT NULL,
	`component_revision_id` text NOT NULL,
	`owner_name_snapshot` text NOT NULL,
	`public_component_id_snapshot` text,
	`public_name_snapshot` text,
	`component_metadata_publication_version` integer,
	PRIMARY KEY(`maintenance_event_id`, `component_id`),
	FOREIGN KEY (`maintenance_event_id`) REFERENCES `maintenance_events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`component_revision_id`) REFERENCES `component_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "maintenance_event_components_position_ck" CHECK("maintenance_event_components"."position" >= 0),
	CONSTRAINT "maintenance_event_components_version_ck" CHECK("maintenance_event_components"."component_version" >= 1),
	CONSTRAINT "maintenance_event_components_public_snapshot_ck" CHECK(("maintenance_event_components"."public_component_id_snapshot" IS NULL AND "maintenance_event_components"."public_name_snapshot" IS NULL AND "maintenance_event_components"."component_metadata_publication_version" IS NULL) OR ("maintenance_event_components"."public_component_id_snapshot" IS NOT NULL AND "maintenance_event_components"."public_name_snapshot" IS NOT NULL AND "maintenance_event_components"."component_metadata_publication_version" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_event_components_position_uidx` ON `maintenance_event_components` (`maintenance_event_id`,`position`);--> statement-breakpoint
CREATE INDEX `maintenance_event_components_dependency_idx` ON `maintenance_event_components` (`component_id`,`maintenance_event_id`);--> statement-breakpoint
CREATE TABLE `maintenance_events` (
	`id` text PRIMARY KEY NOT NULL,
	`maintenance_window_id` text NOT NULL,
	`maintenance_version` integer NOT NULL,
	`kind` text NOT NULL,
	`phase` text NOT NULL,
	`title` text NOT NULL,
	`owner_summary` text,
	`private_note` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`timezone` text NOT NULL,
	`public_title` text,
	`public_phase` text,
	`public_summary` text,
	`public_starts_at` integer,
	`public_ends_at` integer,
	`public_timezone` text,
	`effective_at` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	`owner_ordinal` integer NOT NULL,
	`public_entry_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	FOREIGN KEY (`maintenance_window_id`) REFERENCES `maintenance_windows`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "maintenance_events_version_ck" CHECK("maintenance_events"."maintenance_version" >= 1),
	CONSTRAINT "maintenance_events_kind_ck" CHECK("maintenance_events"."kind" IN ('scheduled', 'rescheduled', 'started', 'completed', 'cancelled', 'note', 'metadata')),
	CONSTRAINT "maintenance_events_phase_ck" CHECK("maintenance_events"."phase" IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
	CONSTRAINT "maintenance_events_interval_ck" CHECK("maintenance_events"."starts_at" < "maintenance_events"."ends_at"),
	CONSTRAINT "maintenance_events_public_snapshot_ck" CHECK(("maintenance_events"."public_title" IS NULL AND "maintenance_events"."public_phase" IS NULL AND "maintenance_events"."public_summary" IS NULL AND "maintenance_events"."public_starts_at" IS NULL AND "maintenance_events"."public_ends_at" IS NULL AND "maintenance_events"."public_timezone" IS NULL) OR ("maintenance_events"."public_title" IS NOT NULL AND "maintenance_events"."public_phase" IS NOT NULL AND "maintenance_events"."public_starts_at" IS NOT NULL AND "maintenance_events"."public_ends_at" IS NOT NULL AND "maintenance_events"."public_timezone" IS NOT NULL AND "maintenance_events"."public_starts_at" < "maintenance_events"."public_ends_at")),
	CONSTRAINT "maintenance_events_owner_ordinal_ck" CHECK("maintenance_events"."owner_ordinal" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_events_public_entry_id_unique` ON `maintenance_events` (`public_entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_events_version_uidx` ON `maintenance_events` (`maintenance_window_id`,`maintenance_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_events_owner_ordinal_uidx` ON `maintenance_events` (`owner_ordinal`);--> statement-breakpoint
CREATE INDEX `maintenance_events_latest_idx` ON `maintenance_events` (`maintenance_window_id`,`maintenance_version`);--> statement-breakpoint
CREATE INDEX `maintenance_events_timeline_idx` ON `maintenance_events` (`effective_at`,`recorded_at`,`owner_ordinal`,`id`);--> statement-breakpoint
CREATE TABLE `maintenance_windows` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "maintenance_windows_version_ck" CHECK("maintenance_windows"."version" >= 1),
	CONSTRAINT "maintenance_windows_timestamp_order_ck" CHECK("maintenance_windows"."updated_at" >= "maintenance_windows"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maintenance_windows_public_id_unique` ON `maintenance_windows` (`public_id`);--> statement-breakpoint
CREATE TABLE `publication_events` (
	`id` text PRIMARY KEY NOT NULL,
	`stream_type` text NOT NULL,
	`stream_id` text NOT NULL,
	`publication_version` integer NOT NULL,
	`action` text NOT NULL,
	`target_source_type` text NOT NULL,
	`target_source_id` text NOT NULL,
	`target_source_revision` integer NOT NULL,
	`target_snapshot_json` text,
	`resulting_disposition` text NOT NULL,
	`resulting_source_type` text,
	`resulting_source_id` text,
	`resulting_source_revision` integer,
	`resulting_current_snapshot_json` text,
	`timeline_entry_id` text,
	`timeline_effective_at` integer,
	`timeline_recorded_at` integer,
	`timeline_snapshot_json` text,
	`snapshot_schema_version` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	`owner_ordinal` integer NOT NULL,
	`public_ordinal` integer NOT NULL,
	`public_privacy_epoch` integer NOT NULL,
	`correlation_id` text NOT NULL,
	CONSTRAINT "publication_events_version_ck" CHECK("publication_events"."publication_version" > 0),
	CONSTRAINT "publication_events_target_revision_ck" CHECK("publication_events"."target_source_revision" > 0),
	CONSTRAINT "publication_events_snapshot_version_ck" CHECK("publication_events"."snapshot_schema_version" > 0),
	CONSTRAINT "publication_events_owner_ordinal_ck" CHECK("publication_events"."owner_ordinal" > 0),
	CONSTRAINT "publication_events_public_ordinal_ck" CHECK("publication_events"."public_ordinal" > 0),
	CONSTRAINT "publication_events_privacy_epoch_ck" CHECK("publication_events"."public_privacy_epoch" >= 0),
	CONSTRAINT "publication_events_stream_source_ck" CHECK(("publication_events"."stream_type" = 'site_profile' AND "publication_events"."target_source_type" = 'site_profile_revision') OR ("publication_events"."stream_type" = 'component_metadata' AND "publication_events"."target_source_type" = 'component_revision') OR ("publication_events"."stream_type" = 'component_status' AND "publication_events"."target_source_type" = 'status_transition') OR ("publication_events"."stream_type" = 'incident' AND "publication_events"."target_source_type" = 'incident_update') OR ("publication_events"."stream_type" = 'maintenance' AND "publication_events"."target_source_type" = 'maintenance_event')),
	CONSTRAINT "publication_events_target_snapshot_ck" CHECK(("publication_events"."action" = 'suppress' AND "publication_events"."target_snapshot_json" IS NULL AND "publication_events"."timeline_snapshot_json" IS NULL) OR ("publication_events"."action" != 'suppress' AND "publication_events"."target_snapshot_json" IS NOT NULL)),
	CONSTRAINT "publication_events_result_snapshot_ck" CHECK(("publication_events"."resulting_disposition" = 'published' AND "publication_events"."resulting_source_type" IS NOT NULL AND "publication_events"."resulting_source_id" IS NOT NULL AND "publication_events"."resulting_source_revision" > 0 AND "publication_events"."resulting_current_snapshot_json" IS NOT NULL) OR ("publication_events"."resulting_disposition" = 'closed' AND "publication_events"."resulting_source_type" IS NULL AND "publication_events"."resulting_source_id" IS NULL AND "publication_events"."resulting_source_revision" IS NULL AND "publication_events"."resulting_current_snapshot_json" IS NULL)),
	CONSTRAINT "publication_events_timeline_snapshot_ck" CHECK(("publication_events"."timeline_entry_id" IS NULL AND "publication_events"."timeline_effective_at" IS NULL AND "publication_events"."timeline_recorded_at" IS NULL AND "publication_events"."timeline_snapshot_json" IS NULL) OR ("publication_events"."timeline_entry_id" IS NOT NULL AND "publication_events"."timeline_effective_at" IS NOT NULL AND "publication_events"."timeline_recorded_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publication_events_stream_version_uidx` ON `publication_events` (`stream_type`,`stream_id`,`publication_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `publication_events_owner_ordinal_uidx` ON `publication_events` (`owner_ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `publication_events_public_ordinal_uidx` ON `publication_events` (`public_ordinal`);--> statement-breakpoint
CREATE INDEX `publication_events_latest_stream_idx` ON `publication_events` (`stream_type`,`stream_id`,`publication_version`);--> statement-breakpoint
CREATE INDEX `publication_events_source_state_idx` ON `publication_events` (`target_source_type`,`target_source_id`,`publication_version`);--> statement-breakpoint
CREATE INDEX `publication_events_timeline_state_idx` ON `publication_events` (`timeline_entry_id`,`public_ordinal`);--> statement-breakpoint
CREATE INDEX `publication_events_timeline_order_idx` ON `publication_events` (`timeline_effective_at`,`timeline_recorded_at`,`public_ordinal`,`timeline_entry_id`);--> statement-breakpoint
CREATE TABLE `site_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "site_profile_singleton_ck" CHECK("site_profile"."id" = 'site'),
	CONSTRAINT "site_profile_version_ck" CHECK("site_profile"."version" >= 1),
	CONSTRAINT "site_profile_timestamp_order_ck" CHECK("site_profile"."updated_at" >= "site_profile"."created_at")
);
--> statement-breakpoint
CREATE TABLE `site_profile_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`site_profile_id` text NOT NULL,
	`site_profile_version` integer NOT NULL,
	`owner_title` text NOT NULL,
	`owner_summary` text,
	`public_title` text,
	`public_summary` text,
	`timezone` text NOT NULL,
	`private_note` text,
	`recorded_at` integer NOT NULL,
	`correlation_id` text NOT NULL,
	FOREIGN KEY (`site_profile_id`) REFERENCES `site_profile`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "site_profile_revisions_version_ck" CHECK("site_profile_revisions"."site_profile_version" >= 1),
	CONSTRAINT "site_profile_revisions_public_copy_ck" CHECK("site_profile_revisions"."public_title" IS NOT NULL OR "site_profile_revisions"."public_summary" IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_profile_revisions_version_uidx` ON `site_profile_revisions` (`site_profile_id`,`site_profile_version`);--> statement-breakpoint
CREATE INDEX `site_profile_revisions_latest_idx` ON `site_profile_revisions` (`site_profile_id`,`site_profile_version`);--> statement-breakpoint
CREATE TABLE `status_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`component_id` text NOT NULL,
	`component_version` integer NOT NULL,
	`condition` text NOT NULL,
	`owner_summary` text,
	`public_summary` text,
	`private_note` text,
	`effective_at` integer NOT NULL,
	`valid_until` integer,
	`recorded_at` integer NOT NULL,
	`owner_ordinal` integer NOT NULL,
	`public_entry_id` text NOT NULL,
	`correlation_id` text NOT NULL,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "status_transitions_version_ck" CHECK("status_transitions"."component_version" >= 1),
	CONSTRAINT "status_transitions_condition_ck" CHECK("status_transitions"."condition" IN ('available', 'limited', 'degraded', 'unavailable')),
	CONSTRAINT "status_transitions_interval_ck" CHECK("status_transitions"."valid_until" IS NULL OR "status_transitions"."valid_until" > "status_transitions"."effective_at"),
	CONSTRAINT "status_transitions_owner_ordinal_ck" CHECK("status_transitions"."owner_ordinal" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `status_transitions_public_entry_id_unique` ON `status_transitions` (`public_entry_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `status_transitions_component_version_uidx` ON `status_transitions` (`component_id`,`component_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `status_transitions_owner_ordinal_uidx` ON `status_transitions` (`owner_ordinal`);--> statement-breakpoint
CREATE INDEX `status_transitions_current_idx` ON `status_transitions` (`component_id`,`effective_at`,`recorded_at`,`owner_ordinal`,`id`);--> statement-breakpoint
CREATE INDEX `status_transitions_timeline_idx` ON `status_transitions` (`effective_at`,`recorded_at`,`owner_ordinal`,`id`);--> statement-breakpoint
CREATE TABLE `timeline_clock` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_ordinal` integer DEFAULT 0 NOT NULL,
	`public_ordinal` integer DEFAULT 0 NOT NULL,
	`public_privacy_epoch` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "timeline_clock_singleton_ck" CHECK("timeline_clock"."id" = 1),
	CONSTRAINT "timeline_clock_owner_ordinal_ck" CHECK("timeline_clock"."owner_ordinal" >= 0),
	CONSTRAINT "timeline_clock_public_ordinal_ck" CHECK("timeline_clock"."public_ordinal" >= 0),
	CONSTRAINT "timeline_clock_privacy_epoch_ck" CHECK("timeline_clock"."public_privacy_epoch" >= 0)
);
