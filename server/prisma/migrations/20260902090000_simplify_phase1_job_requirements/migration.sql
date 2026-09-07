ALTER TABLE `assets`
    ADD COLUMN `measurement_height` DECIMAL(10, 2) NULL,
    ADD COLUMN `measurement_width` DECIMAL(10, 2) NULL;

ALTER TABLE `asset_requests`
    ADD COLUMN `job_no` VARCHAR(191) NULL,
    MODIFY `production_order_no` VARCHAR(191) NULL,
    MODIFY `process` VARCHAR(191) NULL,
    MODIFY `sequence` INTEGER NULL,
    MODIFY `machine_id` INTEGER NULL;

CREATE INDEX `asset_requests_job_no_idx` ON `asset_requests`(`job_no`);

ALTER TABLE `asset_request_lines`
    ADD COLUMN `asset_category_id` INTEGER NULL,
    ADD COLUMN `measurement_height` DECIMAL(10, 2) NULL,
    ADD COLUMN `measurement_width` DECIMAL(10, 2) NULL,
    MODIFY `blade_sku_id` INTEGER NULL;

CREATE INDEX `asset_request_lines_asset_category_id_idx`
    ON `asset_request_lines`(`asset_category_id`);

ALTER TABLE `asset_request_lines`
    ADD CONSTRAINT `asset_request_lines_asset_category_id_fkey`
    FOREIGN KEY (`asset_category_id`) REFERENCES `asset_categories`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
