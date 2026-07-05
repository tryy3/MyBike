CREATE TABLE `strava_bikes` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`strava_gear_id` text NOT NULL,
	`bike_id` text NOT NULL,
	`linked_at` integer NOT NULL,
	`component_credit_from` text NOT NULL,
	CONSTRAINT `fk_strava_bikes_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_strava_bikes_bike_id_bikes_id_fk` FOREIGN KEY (`bike_id`) REFERENCES `bikes`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_strava_bikes_user_gear` ON `strava_bikes` (`user_id`,`strava_gear_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_strava_bikes_user_bike` ON `strava_bikes` (`user_id`,`bike_id`);--> statement-breakpoint
CREATE INDEX `idx_strava_bikes_bike` ON `strava_bikes` (`bike_id`);