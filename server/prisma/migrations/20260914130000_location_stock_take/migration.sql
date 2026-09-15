CREATE TABLE `stock_take_sessions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `stock_take_no` VARCHAR(191) NOT NULL,
  `stock_take_date` DATE NOT NULL,
  `location_id` INTEGER NOT NULL,
  `pic` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `created_by_user_id` INTEGER NOT NULL,
  `completed_by_user_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `stock_take_sessions_stock_take_no_key`(`stock_take_no`),
  INDEX `stock_take_sessions_status_created_at_idx`(`status`, `created_at`),
  INDEX `stock_take_sessions_location_id_idx`(`location_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stock_take_items` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `session_id` INTEGER NOT NULL,
  `asset_id` INTEGER NOT NULL,
  `expected_asset_code` VARCHAR(191) NOT NULL,
  `expected_item_name` VARCHAR(191) NOT NULL,
  `expected_category_name` VARCHAR(191) NOT NULL,
  `expected_epc` VARCHAR(191) NULL,
  `result` ENUM('MISSING', 'FOUND') NOT NULL DEFAULT 'MISSING',
  `scanned_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `stock_take_items_session_id_asset_id_key`(`session_id`, `asset_id`),
  INDEX `stock_take_items_session_id_result_idx`(`session_id`, `result`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stock_take_scans` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `session_id` INTEGER NOT NULL,
  `epc` VARCHAR(191) NOT NULL,
  `scanned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `stock_take_scans_session_id_epc_key`(`session_id`, `epc`),
  INDEX `stock_take_scans_session_id_idx`(`session_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `stock_take_sessions` ADD CONSTRAINT `stock_take_sessions_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_take_sessions` ADD CONSTRAINT `stock_take_sessions_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_take_sessions` ADD CONSTRAINT `stock_take_sessions_completed_by_user_id_fkey` FOREIGN KEY (`completed_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_take_items` ADD CONSTRAINT `stock_take_items_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `stock_take_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `stock_take_items` ADD CONSTRAINT `stock_take_items_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `stock_take_scans` ADD CONSTRAINT `stock_take_scans_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `stock_take_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
