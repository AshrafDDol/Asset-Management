ALTER TABLE `asset_assignments`
    ADD COLUMN `return_condition` ENUM('NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED') NULL,
    ADD COLUMN `return_location_id` INTEGER NULL,
    ADD COLUMN `return_remarks` VARCHAR(191) NULL,
    ADD COLUMN `returned_by_user_id` INTEGER NULL;

CREATE INDEX `asset_assignments_return_location_id_idx`
    ON `asset_assignments`(`return_location_id`);

CREATE INDEX `asset_assignments_returned_by_user_id_idx`
    ON `asset_assignments`(`returned_by_user_id`);

ALTER TABLE `asset_assignments`
    ADD CONSTRAINT `asset_assignments_return_location_id_fkey`
    FOREIGN KEY (`return_location_id`) REFERENCES `locations`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT `asset_assignments_returned_by_user_id_fkey`
    FOREIGN KEY (`returned_by_user_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
