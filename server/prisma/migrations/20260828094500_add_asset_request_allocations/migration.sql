-- CreateTable
CREATE TABLE `asset_request_allocations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_line_id` INTEGER NOT NULL,
    `asset_id` INTEGER NOT NULL,
    `status` ENUM('RESERVED', 'ISSUED', 'RETURNED', 'CANCELLED') NOT NULL DEFAULT 'RESERVED',
    `reserved_by_user_id` INTEGER NOT NULL,
    `reserved_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cancelled_at` DATETIME(3) NULL,
    `remarks` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_request_allocations_request_line_id_asset_id_key`(`request_line_id`, `asset_id`),
    INDEX `asset_request_allocations_request_line_id_status_idx`(`request_line_id`, `status`),
    INDEX `asset_request_allocations_asset_id_status_idx`(`asset_id`, `status`),
    INDEX `asset_request_allocations_reserved_by_user_id_idx`(`reserved_by_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `asset_request_allocations`
    ADD CONSTRAINT `asset_request_allocations_request_line_id_fkey`
    FOREIGN KEY (`request_line_id`) REFERENCES `asset_request_lines`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_request_allocations`
    ADD CONSTRAINT `asset_request_allocations_asset_id_fkey`
    FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_request_allocations`
    ADD CONSTRAINT `asset_request_allocations_reserved_by_user_id_fkey`
    FOREIGN KEY (`reserved_by_user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
