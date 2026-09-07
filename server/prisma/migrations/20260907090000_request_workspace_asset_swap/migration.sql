ALTER TABLE `asset_requests` ADD COLUMN `root_location_id` INTEGER NULL;
CREATE INDEX `asset_requests_root_location_id_idx` ON `asset_requests` (`root_location_id`);
ALTER TABLE `asset_requests` ADD CONSTRAINT `asset_requests_root_location_id_fkey` FOREIGN KEY (`root_location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `asset_request_allocations`
  ADD COLUMN `return_purpose` ENUM('NORMAL_RETURN', 'SWAP') NOT NULL DEFAULT 'NORMAL_RETURN',
  ADD COLUMN `swap_reason` ENUM('WRONG_ASSET', 'NOT_SUITABLE', 'WRONG_MEASUREMENT', 'CONDITION_ISSUE', 'OTHER') NULL,
  ADD COLUMN `swap_remarks` VARCHAR(191) NULL;
