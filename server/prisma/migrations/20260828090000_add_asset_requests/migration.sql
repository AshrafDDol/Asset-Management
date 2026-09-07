-- CreateTable
CREATE TABLE `asset_requests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_no` VARCHAR(191) NOT NULL,
    `production_order_no` VARCHAR(191) NOT NULL,
    `sales_order_no` VARCHAR(191) NULL,
    `external_po_no` VARCHAR(191) NULL,
    `part_code` VARCHAR(191) NULL,
    `measurement_height` DECIMAL(10, 2) NULL,
    `measurement_width` DECIMAL(10, 2) NULL,
    `process` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `machine_id` INTEGER NOT NULL,
    `diecut_location` VARCHAR(191) NULL,
    `requested_by_user_id` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'ISSUED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `remarks` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_requests_request_no_key`(`request_no`),
    INDEX `asset_requests_production_order_no_idx`(`production_order_no`),
    INDEX `asset_requests_sales_order_no_idx`(`sales_order_no`),
    INDEX `asset_requests_machine_id_idx`(`machine_id`),
    INDEX `asset_requests_requested_by_user_id_idx`(`requested_by_user_id`),
    INDEX `asset_requests_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_request_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `request_id` INTEGER NOT NULL,
    `line_no` INTEGER NOT NULL,
    `blade_sku_id` INTEGER NOT NULL,
    `quantity_requested` INTEGER NOT NULL,
    `remarks` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_request_lines_request_id_line_no_key`(`request_id`, `line_no`),
    INDEX `asset_request_lines_request_id_idx`(`request_id`),
    INDEX `asset_request_lines_blade_sku_id_idx`(`blade_sku_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `asset_requests`
    ADD CONSTRAINT `asset_requests_machine_id_fkey`
    FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_requests`
    ADD CONSTRAINT `asset_requests_requested_by_user_id_fkey`
    FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_request_lines`
    ADD CONSTRAINT `asset_request_lines_request_id_fkey`
    FOREIGN KEY (`request_id`) REFERENCES `asset_requests`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_request_lines`
    ADD CONSTRAINT `asset_request_lines_blade_sku_id_fkey`
    FOREIGN KEY (`blade_sku_id`) REFERENCES `blade_skus`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
