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
CREATE TABLE `components` (
	`id` text PRIMARY KEY NOT NULL,
	`bike_id` text NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`model` text,
	`notes` text,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_components_bike` ON `components` (`bike_id`);--> statement-breakpoint
CREATE INDEX `idx_components_active_per_category` ON `components` (`bike_id`,`category`) WHERE "components"."is_active" = 1;