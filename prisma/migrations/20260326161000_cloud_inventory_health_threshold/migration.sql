-- Normalize legacy value before enum change
UPDATE `cloud_remotes`
SET `health_status` = 'warning'
WHERE `health_status` = 'degraded';

-- Add custom warning threshold for capacity alerts
ALTER TABLE `cloud_remotes`
  ADD COLUMN `warning_threshold_percent` TINYINT UNSIGNED NOT NULL DEFAULT 85 AFTER `reserved_capacity`;

-- Expand health status states for inventory dashboard
ALTER TABLE `cloud_remotes`
  MODIFY `health_status` ENUM('healthy', 'warning', 'full', 'unavailable') NOT NULL DEFAULT 'healthy';

CREATE INDEX `idx_cloud_remotes_warning_threshold` ON `cloud_remotes`(`warning_threshold_percent`);
