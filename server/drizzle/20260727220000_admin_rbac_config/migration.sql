CREATE TABLE `roles` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL UNIQUE
);--> statement-breakpoint
CREATE TABLE `permissions` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL UNIQUE
);--> statement-breakpoint
CREATE TABLE `role_permissions` (
  `role_id` text NOT NULL,
  `permission_id` text NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE TABLE `user_roles` (
  `user_id` text NOT NULL,
  `role_id` text NOT NULL,
  PRIMARY KEY (`user_id`, `role_id`),
  FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_roles_user` ON `user_roles` (`user_id`);--> statement-breakpoint
CREATE TABLE `app_settings` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `is_secret` integer DEFAULT false NOT NULL,
  `updated_at` integer NOT NULL,
  `updated_by` text,
  FOREIGN KEY (`updated_by`) REFERENCES `user` (`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE TABLE `config_audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_user_id` text,
  `key` text NOT NULL,
  `old_value` text,
  `new_value` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`actor_user_id`) REFERENCES `user` (`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE INDEX `idx_config_audit_log_created_at` ON `config_audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `app_runtime_state` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL
);--> statement-breakpoint
INSERT OR IGNORE INTO `roles` (`id`, `name`) VALUES
  ('admin', 'admin'),
  ('user', 'user');--> statement-breakpoint
INSERT OR IGNORE INTO `permissions` (`id`, `name`) VALUES
  ('config.read', 'config.read'),
  ('config.write', 'config.write'),
  ('server.restart', 'server.restart'),
  ('users.read', 'users.read'),
  ('users.assign_role', 'users.assign_role'),
  ('audit.read', 'audit.read');--> statement-breakpoint
INSERT OR IGNORE INTO `role_permissions` (`role_id`, `permission_id`) VALUES
  ('admin', 'config.read'),
  ('admin', 'config.write'),
  ('admin', 'server.restart'),
  ('admin', 'users.read'),
  ('admin', 'users.assign_role'),
  ('admin', 'audit.read');
