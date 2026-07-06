CREATE TABLE `strava_sync_state` (
	`user_id` text PRIMARY KEY,
	`last_synced_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_strava_sync_state_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
