CREATE TABLE `maintenance_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`bike_id` text NOT NULL,
	`source` text NOT NULL,
	`template_key` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`component_category` text,
	`trigger_mode` text,
	`distance_meters` integer,
	`interval_days` integer,
	`guide_url` text,
	`enabled` integer DEFAULT true NOT NULL,
	`customized` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`snoozed_until_distance_meters` integer,
	`snoozed_until_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_maintenance_tasks_bike` ON `maintenance_tasks` (`bike_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_maintenance_tasks_bike_template` ON `maintenance_tasks` (`bike_id`,`template_key`) WHERE "maintenance_tasks"."template_key" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `service_records` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`bike_id` text NOT NULL,
	`component_id` text,
	`action` text NOT NULL,
	`completed_at` integer NOT NULL,
	`notes` text,
	`cost` real,
	`wear_distance_meters` integer,
	`wear_moving_time_minutes` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `maintenance_tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_service_records_bike_completed` ON `service_records` (`bike_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `idx_service_records_task_completed` ON `service_records` (`task_id`,`completed_at`);--> statement-breakpoint
CREATE TABLE `maintenance_checklist_state` (
	`task_id` text PRIMARY KEY NOT NULL,
	`last_checked_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `maintenance_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
