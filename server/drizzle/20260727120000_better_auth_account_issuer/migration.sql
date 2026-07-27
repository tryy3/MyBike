DROP INDEX IF EXISTS `idx_account_provider_account`;--> statement-breakpoint
ALTER TABLE `account` ADD `issuer` text NOT NULL DEFAULT 'local:unknown';--> statement-breakpoint
UPDATE `account`
SET
  `issuer` = 'local:credential',
  `account_id` = `user_id`
WHERE `provider_id` = 'credential';--> statement-breakpoint
UPDATE `account`
SET `issuer` = 'local:oauth:' || `provider_id`
WHERE `issuer` = 'local:unknown';--> statement-breakpoint
ALTER TABLE `account` RENAME COLUMN `account_id` TO `provider_account_id`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_issuer_provider_account` ON `account` (`issuer`, `provider_account_id`);
