-- Asset-first Issue Batch replacement.
-- Approved destructive scope: all legacy Asset Request rows and their request-bound scan confirmations.
-- Asset assignments are preserved and unlinked; Asset movements and all master data are preserved.

CREATE TABLE `issue_batches` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batch_no` VARCHAR(191) NOT NULL,
    `job_no` VARCHAR(191) NULL,
    `default_recipient_user_id` INTEGER NULL,
    `default_to_location_id` INTEGER NULL,
    `status` ENUM('PREPARING', 'PROCESSING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PREPARING',
    `remarks` VARCHAR(191) NULL,
    `created_by_user_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `issue_batches_batch_no_key`(`batch_no`),
    INDEX `issue_batches_job_no_idx`(`job_no`),
    INDEX `issue_batches_status_idx`(`status`),
    INDEX `issue_batches_created_by_user_id_idx`(`created_by_user_id`),
    INDEX `issue_batches_default_recipient_user_id_idx`(`default_recipient_user_id`),
    INDEX `issue_batches_default_to_location_id_idx`(`default_to_location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `issue_batch_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `issue_batch_id` INTEGER NOT NULL,
    `asset_id` INTEGER NOT NULL,
    `status` ENUM('RESERVED', 'ISSUED', 'CONFIRMED', 'RETURN_PENDING', 'RETURNED', 'CANCELLED') NOT NULL DEFAULT 'RESERVED',
    `recipient_user_id` INTEGER NULL,
    `to_location_id` INTEGER NULL,
    `return_purpose` ENUM('NORMAL_RETURN', 'SWAP') NOT NULL DEFAULT 'NORMAL_RETURN',
    `swap_reason` ENUM('WRONG_ASSET', 'NOT_SUITABLE', 'WRONG_MEASUREMENT', 'CONDITION_ISSUE', 'OTHER') NULL,
    `swap_remarks` VARCHAR(191) NULL,
    `replacement_for_item_id` INTEGER NULL,
    `selected_by_user_id` INTEGER NOT NULL,
    `selected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cancelled_at` DATETIME(3) NULL,
    `remarks` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `issue_batch_items_issue_batch_id_status_idx`(`issue_batch_id`, `status`),
    INDEX `issue_batch_items_asset_id_status_idx`(`asset_id`, `status`),
    INDEX `issue_batch_items_recipient_user_id_idx`(`recipient_user_id`),
    INDEX `issue_batch_items_to_location_id_idx`(`to_location_id`),
    INDEX `issue_batch_items_selected_by_user_id_idx`(`selected_by_user_id`),
    INDEX `issue_batch_items_replacement_for_item_id_idx`(`replacement_for_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `asset_assignments` DROP FOREIGN KEY `asset_assignments_request_allocation_id_fkey`;
DROP INDEX `asset_assignments_request_allocation_id_key` ON `asset_assignments`;
ALTER TABLE `asset_assignments` DROP COLUMN `request_allocation_id`, ADD COLUMN `issue_batch_item_id` INTEGER NULL;
CREATE UNIQUE INDEX `asset_assignments_issue_batch_item_id_key` ON `asset_assignments`(`issue_batch_item_id`);

-- All legacy confirmation rows are request-bound and cannot be meaningfully re-parented.
DROP TABLE `asset_scan_confirmations`;
CREATE TABLE `asset_scan_confirmations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `asset_id` INTEGER NOT NULL,
    `issue_batch_item_id` INTEGER NOT NULL,
    `assignment_id` INTEGER NULL,
    `confirmation_type` ENUM('ISSUE_CONFIRMATION', 'RETURN_CONFIRMATION') NOT NULL,
    `confirmation_source` ENUM('WEB_ADMIN', 'HANDHELD') NOT NULL,
    `epc` VARCHAR(191) NOT NULL,
    `confirmed_by_user_id` INTEGER NOT NULL,
    `confirmed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `remarks` VARCHAR(191) NULL,

    INDEX `asset_scan_confirmations_asset_id_idx`(`asset_id`),
    INDEX `asset_scan_confirmations_issue_batch_item_id_idx`(`issue_batch_item_id`),
    INDEX `asset_scan_confirmations_assignment_id_idx`(`assignment_id`),
    INDEX `asset_scan_confirmations_confirmed_by_user_id_idx`(`confirmed_by_user_id`),
    INDEX `asset_scan_confirmations_confirmed_at_idx`(`confirmed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `asset_movements` ADD COLUMN `issue_batch_item_id` INTEGER NULL;
CREATE INDEX `asset_movements_issue_batch_item_id_idx` ON `asset_movements`(`issue_batch_item_id`);

DROP TABLE `asset_request_allocations`;
DROP TABLE `asset_request_lines`;
DROP TABLE `asset_requests`;

ALTER TABLE `issue_batches`
  ADD CONSTRAINT `issue_batches_default_recipient_user_id_fkey` FOREIGN KEY (`default_recipient_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `issue_batches_default_to_location_id_fkey` FOREIGN KEY (`default_to_location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `issue_batches_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `issue_batch_items`
  ADD CONSTRAINT `issue_batch_items_issue_batch_id_fkey` FOREIGN KEY (`issue_batch_id`) REFERENCES `issue_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `issue_batch_items_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `issue_batch_items_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `issue_batch_items_to_location_id_fkey` FOREIGN KEY (`to_location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `issue_batch_items_selected_by_user_id_fkey` FOREIGN KEY (`selected_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `issue_batch_items_replacement_for_item_id_fkey` FOREIGN KEY (`replacement_for_item_id`) REFERENCES `issue_batch_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `asset_assignments` ADD CONSTRAINT `asset_assignments_issue_batch_item_id_fkey` FOREIGN KEY (`issue_batch_item_id`) REFERENCES `issue_batch_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `asset_scan_confirmations`
  ADD CONSTRAINT `asset_scan_confirmations_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `asset_scan_confirmations_issue_batch_item_id_fkey` FOREIGN KEY (`issue_batch_item_id`) REFERENCES `issue_batch_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `asset_scan_confirmations_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `asset_assignments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `asset_scan_confirmations_confirmed_by_user_id_fkey` FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `asset_movements` ADD CONSTRAINT `asset_movements_issue_batch_item_id_fkey` FOREIGN KEY (`issue_batch_item_id`) REFERENCES `issue_batch_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
