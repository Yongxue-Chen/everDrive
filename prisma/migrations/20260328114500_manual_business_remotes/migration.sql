ALTER TABLE `cloud_remotes`
  ADD COLUMN `last_checked_at` DATETIME(3) NULL AFTER `is_active`,
  ADD COLUMN `last_alert_at` DATETIME(3) NULL AFTER `last_checked_at`;

ALTER TABLE `cloud_remotes`
  ADD CONSTRAINT `uniq_cloud_remotes_display_name` UNIQUE (`display_name`);

CREATE INDEX `idx_cloud_remotes_last_checked` ON `cloud_remotes`(`last_checked_at`);
CREATE INDEX `idx_cloud_remotes_last_alert` ON `cloud_remotes`(`last_alert_at`);
