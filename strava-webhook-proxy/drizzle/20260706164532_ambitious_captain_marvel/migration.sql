CREATE TABLE `webhook_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`received_at` integer NOT NULL,
	`object_type` text NOT NULL,
	`aspect_type` text NOT NULL,
	`object_id` integer NOT NULL,
	`owner_id` integer NOT NULL,
	`subscription_id` integer NOT NULL,
	`event_time` integer NOT NULL,
	`updates_json` text,
	`raw_body` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_webhook_events_received_at` ON `webhook_events` (`received_at`);--> statement-breakpoint
CREATE INDEX `idx_webhook_events_owner_id` ON `webhook_events` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_webhook_events_event_time` ON `webhook_events` (`event_time`);