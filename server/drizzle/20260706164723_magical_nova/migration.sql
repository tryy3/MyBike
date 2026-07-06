CREATE TABLE `strava_webhook_cursor` (
	`id` integer PRIMARY KEY,
	`last_proxy_event_id` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
