ALTER TABLE `mapping_tasks`
  ADD COLUMN `source_type` ENUM('local', 'rclone') NOT NULL DEFAULT 'local',
  ADD COLUMN `source_remote_name` VARCHAR(128) NULL,
  ADD COLUMN `source_path` VARCHAR(512) NOT NULL DEFAULT '';
