CREATE TABLE `idempotency` (
	`idempotency_key` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idempotency_created_idx` ON `idempotency` (`created_at`);--> statement-breakpoint
CREATE TABLE `pages` (
	`page_id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`client_hash` text,
	`ip_hash` text
);
--> statement-breakpoint
CREATE INDEX `pages_expiry_idx` ON `pages` (`expires_at`);--> statement-breakpoint
CREATE INDEX `pages_client_idx` ON `pages` (`client_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `pages_ip_idx` ON `pages` (`ip_hash`,`created_at`);