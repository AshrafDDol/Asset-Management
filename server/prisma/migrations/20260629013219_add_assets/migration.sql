-- CreateTable
CREATE TABLE `assets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `asset_code` VARCHAR(191) NOT NULL,
    `item_name` VARCHAR(191) NOT NULL,
    `category_id` INTEGER NOT NULL,
    `department_id` INTEGER NULL,
    `location_id` INTEGER NULL,
    `serial_number` VARCHAR(191) NULL,
    `brand` VARCHAR(191) NULL,
    `model` VARCHAR(191) NULL,
    `purchase_date` DATE NULL,
    `purchase_cost` DECIMAL(12, 2) NULL,
    `status` ENUM('AVAILABLE', 'ASSIGNED', 'IN_USE', 'UNDER_MAINTENANCE', 'LOST', 'DISPOSED') NOT NULL DEFAULT 'AVAILABLE',
    `condition` ENUM('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED') NOT NULL DEFAULT 'GOOD',
    `remarks` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `assets_asset_code_key`(`asset_code`),
    UNIQUE INDEX `assets_serial_number_key`(`serial_number`),
    INDEX `assets_category_id_idx`(`category_id`),
    INDEX `assets_department_id_idx`(`department_id`),
    INDEX `assets_location_id_idx`(`location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `asset_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
