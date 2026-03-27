ALTER TABLE `cloud_remotes`
  ADD COLUMN `cloud_trash_enabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `cloud_trash_base_path` VARCHAR(512) NOT NULL DEFAULT '.everdrive-trash';
