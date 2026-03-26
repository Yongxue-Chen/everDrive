ALTER TABLE `mapping_tasks`
  ADD COLUMN `deleted_at` DATETIME(3) NULL;

CREATE INDEX `idx_mapping_tasks_deleted_at` ON `mapping_tasks`(`deleted_at`);
