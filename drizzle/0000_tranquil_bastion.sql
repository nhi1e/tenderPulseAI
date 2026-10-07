CREATE TABLE `alert_reads` (
	`alert_id` text NOT NULL,
	`reader_id` text NOT NULL,
	`read_at` text NOT NULL,
	PRIMARY KEY(`alert_id`, `reader_id`),
	FOREIGN KEY (`alert_id`) REFERENCES `tender_alerts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alert_reads_reader_id_idx` ON `alert_reads` (`reader_id`);--> statement-breakpoint
CREATE TABLE `alert_sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`generated_at` text NOT NULL,
	`received_at` text NOT NULL,
	`new_records` integer DEFAULT 0 NOT NULL,
	`changed_records` integer DEFAULT 0 NOT NULL,
	`inserted_alerts` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tender_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`kind` text NOT NULL,
	`content_hash` text NOT NULL,
	`detected_at` text NOT NULL,
	`sync_generated_at` text NOT NULL,
	`sub_ou` text NOT NULL,
	`product_group` text NOT NULL,
	`hospital` text NOT NULL,
	`buyer_id` text DEFAULT '' NOT NULL,
	`product_name` text NOT NULL,
	`company` text NOT NULL,
	`tender_notice` text DEFAULT '' NOT NULL,
	`decision_date` text DEFAULT '' NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tender_alerts_detected_at_idx` ON `tender_alerts` (`detected_at`);--> statement-breakpoint
CREATE INDEX `tender_alerts_sub_ou_idx` ON `tender_alerts` (`sub_ou`);--> statement-breakpoint
CREATE INDEX `tender_alerts_source_key_idx` ON `tender_alerts` (`source_key`);