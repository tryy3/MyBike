CREATE TABLE `strava_activities` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`bike_id` text NOT NULL,
	`strava_activity_id` text NOT NULL,
	`strava_gear_id` text NOT NULL,
	`distance_meters` integer NOT NULL,
	`moving_time_minutes` integer NOT NULL,
	`start_date` text NOT NULL,
	`processed_at` integer NOT NULL,
	CONSTRAINT `fk_strava_activities_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_strava_activities_bike_id_bikes_id_fk` FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `strava_activity_components` (
	`id` text PRIMARY KEY,
	`activity_id` text NOT NULL,
	`component_id` text NOT NULL,
	`distance_meters` integer NOT NULL,
	`moving_time_minutes` integer NOT NULL,
	CONSTRAINT `fk_strava_activity_components_activity_id_strava_activities_id_fk` FOREIGN KEY (`activity_id`) REFERENCES `strava_activities`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_strava_activity_components_component_id_components_id_fk` FOREIGN KEY (`component_id`) REFERENCES `components`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `bikes` ADD `strava_gear_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bikes_user_strava_gear` ON `bikes` (`user_id`,`strava_gear_id`) WHERE "bikes"."strava_gear_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_strava_activities_user` ON `strava_activities` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_strava_activities_bike` ON `strava_activities` (`bike_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_strava_activities_user_activity` ON `strava_activities` (`user_id`,`strava_activity_id`);--> statement-breakpoint
CREATE INDEX `idx_strava_activity_components_activity` ON `strava_activity_components` (`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_strava_activity_components_component` ON `strava_activity_components` (`component_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_strava_activity_components_unique` ON `strava_activity_components` (`activity_id`,`component_id`);