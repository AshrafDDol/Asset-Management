ALTER TABLE `asset_assignments`
    ADD COLUMN `request_allocation_id` INTEGER NULL,
    ADD COLUMN `issued_at` DATETIME(3) NULL;

CREATE UNIQUE INDEX `asset_assignments_request_allocation_id_key`
    ON `asset_assignments`(`request_allocation_id`);

ALTER TABLE `asset_assignments`
    ADD CONSTRAINT `asset_assignments_request_allocation_id_fkey`
    FOREIGN KEY (`request_allocation_id`) REFERENCES `asset_request_allocations`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
