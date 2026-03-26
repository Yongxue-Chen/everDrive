-- CreateTable
CREATE TABLE `files` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `file_hash` VARCHAR(128) NOT NULL,
    `hash_type` ENUM('md5', 'sha1', 'sha256', 'blake3') NOT NULL,
    `file_size` BIGINT UNSIGNED NOT NULL,
    `modified_time` DATETIME(3) NOT NULL,
    `local_path` VARCHAR(512) NOT NULL,
    `relative_path` VARCHAR(512) NOT NULL,
    `mapping_task_id` BIGINT UNSIGNED NOT NULL,
    `scan_status` ENUM('pending', 'scanned', 'changed', 'missing', 'error') NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_files_task_hash`(`mapping_task_id`, `file_hash`),
    INDEX `idx_files_task_hash_local_path`(`mapping_task_id`, `file_hash`, `local_path`),
    INDEX `idx_files_hash`(`file_hash`),
    INDEX `idx_files_task_scan_status`(`mapping_task_id`, `scan_status`),
    INDEX `idx_files_task_hash_mtime`(`mapping_task_id`, `file_hash`, `modified_time`),
    UNIQUE INDEX `uniq_files_task_local_path`(`mapping_task_id`, `local_path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mapping_tasks` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(128) NOT NULL,
    `local_path` VARCHAR(512) NOT NULL,
    `sync_mode` ENUM('archive', 'mirror') NOT NULL,
    `encryption_enabled` BOOLEAN NOT NULL DEFAULT false,
    `redundancy_enabled` BOOLEAN NOT NULL DEFAULT false,
    `split_enabled` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_mapping_tasks_is_active`(`is_active`),
    INDEX `idx_mapping_tasks_sync_mode`(`sync_mode`),
    UNIQUE INDEX `uniq_mapping_tasks_name`(`name`),
    UNIQUE INDEX `uniq_mapping_tasks_local_path`(`local_path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cloud_remotes` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `remote_name` VARCHAR(128) NOT NULL,
    `display_name` VARCHAR(128) NOT NULL,
    `total_capacity` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `used_capacity` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `reserved_capacity` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `health_status` ENUM('healthy', 'degraded', 'unavailable') NOT NULL DEFAULT 'healthy',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `last_sync_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_cloud_remotes_active_health`(`is_active`, `health_status`),
    INDEX `idx_cloud_remotes_last_sync`(`last_sync_at`),
    UNIQUE INDEX `uniq_cloud_remotes_remote_name`(`remote_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mapping_task_remotes` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `mapping_task_id` BIGINT UNSIGNED NOT NULL,
    `remote_id` BIGINT UNSIGNED NOT NULL,
    `role` ENUM('primary', 'backup', 'shard') NOT NULL,
    `priority` INTEGER UNSIGNED NOT NULL DEFAULT 100,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_mtr_task_role_priority`(`mapping_task_id`, `role`, `priority`),
    INDEX `idx_mtr_remote_role`(`remote_id`, `role`),
    UNIQUE INDEX `uniq_mapping_task_remote`(`mapping_task_id`, `remote_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_locations` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `file_id` BIGINT UNSIGNED NOT NULL,
    `remote_id` BIGINT UNSIGNED NOT NULL,
    `remote_path` VARCHAR(512) NOT NULL,
    `remote_file_name` VARCHAR(255) NOT NULL,
    `sync_status` ENUM('pending', 'synced', 'failed', 'deleted', 'verifying') NOT NULL DEFAULT 'pending',
    `last_verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_file_locations_remote_sync_status`(`remote_id`, `sync_status`),
    INDEX `idx_file_locations_file_sync_status`(`file_id`, `sync_status`),
    UNIQUE INDEX `uniq_file_locations_file_remote`(`file_id`, `remote_id`),
    UNIQUE INDEX `uniq_file_locations_remote_path`(`remote_id`, `remote_path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_jobs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `job_type` ENUM('scan', 'sync', 'verify', 'migrate', 'rename_detect', 'cleanup') NOT NULL,
    `mapping_task_id` BIGINT UNSIGNED NOT NULL,
    `status` ENUM('queued', 'running', 'success', 'failed', 'cancelled') NOT NULL DEFAULT 'queued',
    `payload_json` JSON NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_sync_jobs_task_created`(`mapping_task_id`, `created_at`),
    INDEX `idx_sync_jobs_task_status_created`(`mapping_task_id`, `status`, `created_at`),
    INDEX `idx_sync_jobs_type_status`(`job_type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operation_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `operation_type` ENUM('create', 'update', 'rename', 'migrate', 'delete', 'verify', 'sync') NOT NULL,
    `target_type` ENUM('file', 'mapping_task', 'remote', 'sync_job', 'file_location') NOT NULL,
    `target_id` BIGINT UNSIGNED NULL,
    `message` TEXT NOT NULL,
    `metadata_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_operation_logs_target`(`target_type`, `target_id`, `created_at`),
    INDEX `idx_operation_logs_op`(`operation_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `files_mapping_task_id_fkey` FOREIGN KEY (`mapping_task_id`) REFERENCES `mapping_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mapping_task_remotes` ADD CONSTRAINT `mapping_task_remotes_mapping_task_id_fkey` FOREIGN KEY (`mapping_task_id`) REFERENCES `mapping_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mapping_task_remotes` ADD CONSTRAINT `mapping_task_remotes_remote_id_fkey` FOREIGN KEY (`remote_id`) REFERENCES `cloud_remotes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_locations` ADD CONSTRAINT `file_locations_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file_locations` ADD CONSTRAINT `file_locations_remote_id_fkey` FOREIGN KEY (`remote_id`) REFERENCES `cloud_remotes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sync_jobs` ADD CONSTRAINT `sync_jobs_mapping_task_id_fkey` FOREIGN KEY (`mapping_task_id`) REFERENCES `mapping_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

