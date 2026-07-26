ALTER TABLE `components` ADD `properties` text;--> statement-breakpoint
UPDATE `components`
SET `properties` = '{"lubeType":"wet_lube"}'
WHERE `category` = 'chain'
  AND (`properties` IS NULL OR `properties` = '' OR `properties` = '{}');
