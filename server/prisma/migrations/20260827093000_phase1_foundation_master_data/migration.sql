-- AlterEnum
ALTER TABLE `assets`
    MODIFY `status` ENUM('AVAILABLE', 'RESERVED', 'ASSIGNED', 'IN_USE', 'UNDER_MAINTENANCE', 'LOST', 'DISPOSED') NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE `locations`
    ADD COLUMN `parent_location_id` INTEGER NULL,
    ADD COLUMN `location_type` ENUM('STORE', 'WAREHOUSE', 'RACK', 'LEVEL', 'BIN', 'FILE', 'PRODUCTION_AREA', 'MACHINE_LOCATION', 'OTHER') NOT NULL DEFAULT 'OTHER';

-- CreateTable
CREATE TABLE `blade_skus` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sku_code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category_id` INTEGER NOT NULL,
    `blade_type` VARCHAR(191) NULL,
    `specification` VARCHAR(191) NULL,
    `remarks` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `blade_skus_sku_code_key`(`sku_code`),
    INDEX `blade_skus_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `machines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `machine_code` VARCHAR(191) NOT NULL,
    `machine_name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `machines_machine_code_key`(`machine_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `assets`
    ADD COLUMN `blade_sku_id` INTEGER NULL;

-- CreateIndex
CREATE INDEX `locations_parent_location_id_idx` ON `locations`(`parent_location_id`);

-- CreateIndex
CREATE INDEX `assets_blade_sku_id_idx` ON `assets`(`blade_sku_id`);

-- AddForeignKey
ALTER TABLE `locations`
    ADD CONSTRAINT `locations_parent_location_id_fkey`
    FOREIGN KEY (`parent_location_id`) REFERENCES `locations`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blade_skus`
    ADD CONSTRAINT `blade_skus_category_id_fkey`
    FOREIGN KEY (`category_id`) REFERENCES `asset_categories`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets`
    ADD CONSTRAINT `assets_blade_sku_id_fkey`
    FOREIGN KEY (`blade_sku_id`) REFERENCES `blade_skus`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
