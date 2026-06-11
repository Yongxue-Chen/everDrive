CREATE TABLE `rclone_remote_metadata` (
  `remote_name` VARCHAR(128) NOT NULL,
  `web_url` VARCHAR(2048) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`remote_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
