UPDATE `components`
SET `is_active` = 0
WHERE `is_active` = 1
AND `rowid` NOT IN (
  SELECT MIN(`rowid`)
  FROM `components`
  WHERE `is_active` = 1
  GROUP BY `bike_id`, `category`
);--> statement-breakpoint
DROP INDEX `idx_components_active_per_category`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_components_active_per_category` ON `components` (`bike_id`,`category`) WHERE "components"."is_active" = 1;
