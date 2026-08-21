-- CreateTable
CREATE TABLE `asset_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `movement_no` VARCHAR(191) NOT NULL,
    `asset_id` INTEGER NOT NULL,
    `from_department_id` INTEGER NULL,
    `to_department_id` INTEGER NULL,
    `from_location_id` INTEGER NULL,
    `to_location_id` INTEGER NULL,
    `moved_by_user_id` INTEGER NOT NULL,
    `movement_type` ENUM('LOCATION_TRANSFER', 'DEPARTMENT_TRANSFER', 'FULL_TRANSFER') NOT NULL,
    `movement_date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reason` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_movements_movement_no_key`(`movement_no`),
    INDEX `asset_movements_asset_id_idx`(`asset_id`),
    INDEX `asset_movements_moved_by_user_id_idx`(`moved_by_user_id`),
    INDEX `asset_movements_from_department_id_idx`(`from_department_id`),
    INDEX `asset_movements_to_department_id_idx`(`to_department_id`),
    INDEX `asset_movements_from_location_id_idx`(`from_location_id`),
    INDEX `asset_movements_to_location_id_idx`(`to_location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `asset_movements` ADD CONSTRAINT `asset_movements_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_movements` ADD CONSTRAINT `asset_movements_moved_by_user_id_fkey` FOREIGN KEY (`moved_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_movements` ADD CONSTRAINT `asset_movements_from_department_id_fkey` FOREIGN KEY (`from_department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_movements` ADD CONSTRAINT `asset_movements_to_department_id_fkey` FOREIGN KEY (`to_department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_movements` ADD CONSTRAINT `asset_movements_from_location_id_fkey` FOREIGN KEY (`from_location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_movements` ADD CONSTRAINT `asset_movements_to_location_id_fkey` FOREIGN KEY (`to_location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
