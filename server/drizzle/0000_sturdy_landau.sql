CREATE TABLE `bikes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`model` text,
	`year` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bikes_name` ON `bikes` (`name`);--> statement-breakpoint
CREATE TABLE `component_options` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_id` text NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`model` text,
	`notes` text,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `component_slots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_options_slot` ON `component_options` (`slot_id`);--> statement-breakpoint
CREATE INDEX `idx_options_active_per_slot` ON `component_options` (`slot_id`) WHERE "component_options"."is_active" = 1;--> statement-breakpoint
CREATE TABLE `component_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`bike_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_slots_bike` ON `component_slots` (`bike_id`);