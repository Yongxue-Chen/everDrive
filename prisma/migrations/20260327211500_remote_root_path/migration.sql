ALTER TABLE `cloud_remotes`
  ADD COLUMN `remote_root_path` VARCHAR(512) NOT NULL DEFAULT '' AFTER `display_name`;
