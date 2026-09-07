ALTER TABLE `assets`
    MODIFY `status` ENUM('AVAILABLE', 'RESERVED', 'PENDING_CONFIRMATION', 'ASSIGNED', 'IN_USE', 'RETURN_PENDING', 'UNDER_MAINTENANCE', 'LOST', 'DISPOSED') NOT NULL DEFAULT 'AVAILABLE';

ALTER TABLE `asset_request_allocations`
    MODIFY `status` ENUM('RESERVED', 'ISSUED', 'CONFIRMED', 'RETURN_PENDING', 'RETURNED', 'CANCELLED') NOT NULL DEFAULT 'RESERVED';

DROP INDEX `asset_request_allocations_request_line_id_asset_id_key`
    ON `asset_request_allocations`;

CREATE TABLE `asset_scan_confirmations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `asset_id` INTEGER NOT NULL,
    `request_allocation_id` INTEGER NOT NULL,
    `assignment_id` INTEGER NULL,
    `confirmation_type` ENUM('ISSUE_CONFIRMATION', 'RETURN_CONFIRMATION') NOT NULL,
    `confirmation_source` ENUM('WEB_ADMIN', 'HANDHELD') NOT NULL,
    `epc` VARCHAR(191) NOT NULL,
    `confirmed_by_user_id` INTEGER NOT NULL,
    `confirmed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `remarks` VARCHAR(191) NULL,

    INDEX `asset_scan_confirmations_asset_id_idx`(`asset_id`),
    INDEX `asset_scan_confirmations_request_allocation_id_idx`(`request_allocation_id`),
    INDEX `asset_scan_confirmations_assignment_id_idx`(`assignment_id`),
    INDEX `asset_scan_confirmations_confirmed_by_user_id_idx`(`confirmed_by_user_id`),
    INDEX `asset_scan_confirmations_confirmed_at_idx`(`confirmed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `asset_scan_confirmations`
    ADD CONSTRAINT `asset_scan_confirmations_asset_id_fkey`
    FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `asset_scan_confirmations_request_allocation_id_fkey`
    FOREIGN KEY (`request_allocation_id`) REFERENCES `asset_request_allocations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `asset_scan_confirmations_assignment_id_fkey`
    FOREIGN KEY (`assignment_id`) REFERENCES `asset_assignments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `asset_scan_confirmations_confirmed_by_user_id_fkey`
    FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
