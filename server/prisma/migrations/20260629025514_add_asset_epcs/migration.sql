-- CreateTable
CREATE TABLE `asset_epcs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `epc_code` VARCHAR(191) NOT NULL,
    `asset_id` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'DAMAGED', 'LOST', 'RETIRED') NOT NULL DEFAULT 'ACTIVE',
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unassigned_at` DATETIME(3) NULL,
    `remarks` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_epcs_epc_code_key`(`epc_code`),
    UNIQUE INDEX `asset_epcs_asset_id_key`(`asset_id`),
    INDEX `asset_epcs_asset_id_idx`(`asset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `asset_epcs` ADD CONSTRAINT `asset_epcs_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
