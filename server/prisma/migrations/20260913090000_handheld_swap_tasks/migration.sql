CREATE TABLE `handheld_swap_tasks` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `issue_batch_id` INTEGER NOT NULL,
  `target_item_id` INTEGER NOT NULL,
  `replacement_asset_id` INTEGER NOT NULL,
  `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `remarks` VARCHAR(191) NULL,
  `created_by_user_id` INTEGER NOT NULL,
  `confirmed_by_user_id` INTEGER NULL,
  `confirmed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `handheld_swap_tasks_status_created_at_idx` (`status`, `created_at`),
  INDEX `handheld_swap_tasks_issue_batch_id_status_idx` (`issue_batch_id`, `status`),
  INDEX `handheld_swap_tasks_target_item_id_status_idx` (`target_item_id`, `status`),
  INDEX `handheld_swap_tasks_replacement_asset_id_status_idx` (`replacement_asset_id`, `status`),
  CONSTRAINT `handheld_swap_tasks_issue_batch_id_fkey` FOREIGN KEY (`issue_batch_id`) REFERENCES `issue_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `handheld_swap_tasks_target_item_id_fkey` FOREIGN KEY (`target_item_id`) REFERENCES `issue_batch_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `handheld_swap_tasks_replacement_asset_id_fkey` FOREIGN KEY (`replacement_asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
  ,CONSTRAINT `handheld_swap_tasks_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
  ,CONSTRAINT `handheld_swap_tasks_confirmed_by_user_id_fkey` FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
