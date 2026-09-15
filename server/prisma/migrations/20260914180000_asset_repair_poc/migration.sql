ALTER TABLE `assets` MODIFY `status` ENUM('AVAILABLE', 'RESERVED', 'PENDING_CONFIRMATION', 'ASSIGNED', 'IN_USE', 'UNDER_MAINTENANCE', 'UNDER_REPAIR', 'LOST', 'DISPOSED') NOT NULL DEFAULT 'AVAILABLE';

CREATE TABLE `asset_repairs` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `asset_id` INTEGER NOT NULL,
  `status` ENUM('PREPARED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PREPARED',
  `reason` VARCHAR(191) NOT NULL,
  `repair_location_id` INTEGER NOT NULL,
  `remarks` VARCHAR(191) NULL,
  `started_at` DATETIME(3) NULL,
  `started_by_user_id` INTEGER NULL,
  `completed_at` DATETIME(3) NULL,
  `completed_by_user_id` INTEGER NULL,
  `completion_remarks` VARCHAR(191) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `asset_repairs_asset_id_status_idx`(`asset_id`, `status`),
  INDEX `asset_repairs_repair_location_id_idx`(`repair_location_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `repair_tasks` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `repair_id` INTEGER NOT NULL,
  `action` ENUM('START_REPAIR', 'COMPLETE_REPAIR') NOT NULL,
  `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `created_by_user_id` INTEGER NOT NULL,
  `confirmed_by_user_id` INTEGER NULL,
  `cancelled_by_user_id` INTEGER NULL,
  `confirmed_at` DATETIME(3) NULL,
  `cancelled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `repair_tasks_status_action_created_at_idx`(`status`, `action`, `created_at`),
  INDEX `repair_tasks_repair_id_status_idx`(`repair_id`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `asset_repairs` ADD CONSTRAINT `asset_repairs_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `asset_repairs` ADD CONSTRAINT `asset_repairs_repair_location_id_fkey` FOREIGN KEY (`repair_location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `asset_repairs` ADD CONSTRAINT `asset_repairs_started_by_user_id_fkey` FOREIGN KEY (`started_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `asset_repairs` ADD CONSTRAINT `asset_repairs_completed_by_user_id_fkey` FOREIGN KEY (`completed_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `repair_tasks` ADD CONSTRAINT `repair_tasks_repair_id_fkey` FOREIGN KEY (`repair_id`) REFERENCES `asset_repairs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `repair_tasks` ADD CONSTRAINT `repair_tasks_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `repair_tasks` ADD CONSTRAINT `repair_tasks_confirmed_by_user_id_fkey` FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `repair_tasks` ADD CONSTRAINT `repair_tasks_cancelled_by_user_id_fkey` FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
