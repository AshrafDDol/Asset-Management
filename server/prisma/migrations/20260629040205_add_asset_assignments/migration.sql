-- CreateTable
CREATE TABLE `asset_assignments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `assignment_no` VARCHAR(191) NOT NULL,
    `asset_id` INTEGER NOT NULL,
    `assigned_to_user_id` INTEGER NOT NULL,
    `assigned_by_user_id` INTEGER NOT NULL,
    `department_id` INTEGER NULL,
    `location_id` INTEGER NULL,
    `assigned_date` DATE NOT NULL,
    `return_due_date` DATE NULL,
    `returned_at` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'RETURNED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `purpose` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_assignments_assignment_no_key`(`assignment_no`),
    INDEX `asset_assignments_asset_id_idx`(`asset_id`),
    INDEX `asset_assignments_assigned_to_user_id_idx`(`assigned_to_user_id`),
    INDEX `asset_assignments_assigned_by_user_id_idx`(`assigned_by_user_id`),
    INDEX `asset_assignments_department_id_idx`(`department_id`),
    INDEX `asset_assignments_location_id_idx`(`location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `asset_assignments` ADD CONSTRAINT `asset_assignments_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_assignments` ADD CONSTRAINT `asset_assignments_assigned_to_user_id_fkey` FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_assignments` ADD CONSTRAINT `asset_assignments_assigned_by_user_id_fkey` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_assignments` ADD CONSTRAINT `asset_assignments_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_assignments` ADD CONSTRAINT `asset_assignments_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
