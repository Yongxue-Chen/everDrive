ALTER TABLE `mapping_task_remotes`
  ADD COLUMN `remote_base_path` VARCHAR(512) NOT NULL DEFAULT '' AFTER `priority`;
