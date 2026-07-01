ALTER TABLE `components` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_components_category_order` ON `components` (`bike_id`,`category`,`sort_order`);