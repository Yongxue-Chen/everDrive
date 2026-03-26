ALTER TABLE `files`
  ADD COLUMN `md5_hash` VARCHAR(32) NULL,
  ADD COLUMN `sha1_hash` VARCHAR(40) NULL;

CREATE INDEX `idx_files_task_md5` ON `files`(`mapping_task_id`, `md5_hash`);
CREATE INDEX `idx_files_task_sha1` ON `files`(`mapping_task_id`, `sha1_hash`);
