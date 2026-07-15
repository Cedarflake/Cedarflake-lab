PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `incident_update_public_components` (
	`incident_update_id` text NOT NULL,
	`position` integer NOT NULL,
	`component_id` text NOT NULL,
	`public_component_id_snapshot` text NOT NULL,
	`public_name_snapshot` text NOT NULL,
	`component_metadata_publication_version` integer NOT NULL,
	PRIMARY KEY(`incident_update_id`, `component_id`),
	FOREIGN KEY (`incident_update_id`) REFERENCES `incident_updates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "incident_update_public_components_position_ck" CHECK("incident_update_public_components"."position" >= 0),
	CONSTRAINT "incident_update_public_components_version_ck" CHECK("incident_update_public_components"."component_metadata_publication_version" > 0)
);
--> statement-breakpoint
INSERT INTO `incident_update_public_components`(
	"incident_update_id",
	"position",
	"component_id",
	"public_component_id_snapshot",
	"public_name_snapshot",
	"component_metadata_publication_version"
)
SELECT
	"incident_update_id",
	"position",
	"component_id",
	"public_component_id_snapshot",
	"public_name_snapshot",
	"component_metadata_publication_version"
FROM `incident_update_components`
WHERE "public_component_id_snapshot" IS NOT NULL
	AND "public_name_snapshot" IS NOT NULL
	AND "component_metadata_publication_version" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_incident_update_components` (
	`incident_update_id` text NOT NULL,
	`position` integer NOT NULL,
	`component_id` text NOT NULL,
	`component_version` integer NOT NULL,
	`component_revision_id` text NOT NULL,
	`owner_name_snapshot` text NOT NULL,
	PRIMARY KEY(`incident_update_id`, `component_id`),
	FOREIGN KEY (`incident_update_id`) REFERENCES `incident_updates`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`component_revision_id`) REFERENCES `component_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "incident_update_components_position_ck" CHECK("__new_incident_update_components"."position" >= 0),
	CONSTRAINT "incident_update_components_version_ck" CHECK("__new_incident_update_components"."component_version" >= 1)
);
--> statement-breakpoint
INSERT INTO `__new_incident_update_components`(
	"incident_update_id",
	"position",
	"component_id",
	"component_version",
	"component_revision_id",
	"owner_name_snapshot"
)
SELECT
	"incident_update_id",
	"position",
	"component_id",
	"component_version",
	"component_revision_id",
	"owner_name_snapshot"
FROM `incident_update_components`;--> statement-breakpoint
DROP TABLE `incident_update_components`;--> statement-breakpoint
ALTER TABLE `__new_incident_update_components` RENAME TO `incident_update_components`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `incident_update_components_position_uidx` ON `incident_update_components` (`incident_update_id`,`position`);--> statement-breakpoint
CREATE INDEX `incident_update_components_dependency_idx` ON `incident_update_components` (`component_id`,`incident_update_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `incident_update_public_components_position_uidx` ON `incident_update_public_components` (`incident_update_id`,`position`);--> statement-breakpoint
CREATE INDEX `incident_update_public_components_dependency_idx` ON `incident_update_public_components` (`component_id`,`incident_update_id`);
