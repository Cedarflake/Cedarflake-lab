PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_command_receipts` (
	`owner_key` text NOT NULL,
	`action` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`result_ref` text NOT NULL,
	`response_body_json` text,
	`response_expires_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`owner_key`, `action`, `idempotency_key`),
	CONSTRAINT "command_receipts_owner_key_ck" CHECK("__new_command_receipts"."owner_key" GLOB 'github:[1-9]*' AND substr("__new_command_receipts"."owner_key", 8) NOT GLOB '*[^0-9]*'),
	CONSTRAINT "command_receipts_payload_hash_ck" CHECK(length("__new_command_receipts"."payload_hash") = 64 AND "__new_command_receipts"."payload_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "command_receipts_response_expiry_ck" CHECK("__new_command_receipts"."response_expires_at" IS NULL OR "__new_command_receipts"."response_expires_at" > "__new_command_receipts"."created_at")
);
--> statement-breakpoint
INSERT INTO `__new_command_receipts`("owner_key", "action", "idempotency_key", "payload_hash", "result_ref", "response_body_json", "response_expires_at", "created_at") SELECT "owner_key", "action", "idempotency_key", "payload_hash", "result_ref", "response_body_json", "response_expires_at", "created_at" FROM `command_receipts`;--> statement-breakpoint
DROP TABLE `command_receipts`;--> statement-breakpoint
ALTER TABLE `__new_command_receipts` RENAME TO `command_receipts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `command_receipts_response_expiry_idx` ON `command_receipts` (`response_expires_at`) WHERE "command_receipts"."response_body_json" IS NOT NULL;