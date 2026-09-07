ALTER TABLE `assets` ADD COLUMN `home_location_id` INTEGER NULL;
CREATE INDEX `assets_home_location_id_idx` ON `assets` (`home_location_id`);
ALTER TABLE `assets` ADD CONSTRAINT `assets_home_location_id_fkey` FOREIGN KEY (`home_location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `asset_request_lines` ADD COLUMN `prepared_recipient_user_id` INTEGER NULL, ADD COLUMN `specific_location_id` INTEGER NULL;
CREATE INDEX `asset_request_lines_prepared_recipient_user_id_idx` ON `asset_request_lines` (`prepared_recipient_user_id`);
CREATE INDEX `asset_request_lines_specific_location_id_idx` ON `asset_request_lines` (`specific_location_id`);
ALTER TABLE `asset_request_lines` ADD CONSTRAINT `asset_request_lines_prepared_recipient_user_id_fkey` FOREIGN KEY (`prepared_recipient_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `asset_request_lines` ADD CONSTRAINT `asset_request_lines_specific_location_id_fkey` FOREIGN KEY (`specific_location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only currently Available Assets at active storage, without operational claims.
-- Operational/inactive/non-storage records remain explicitly unresolved.
UPDATE `assets` a JOIN `locations` l ON l.id = a.location_id
SET a.home_location_id = a.location_id
WHERE a.status = 'AVAILABLE' AND l.is_active = true
AND l.location_type IN ('STORE','WAREHOUSE','RACK','LEVEL','BIN','FILE')
AND NOT EXISTS (SELECT 1 FROM `asset_assignments` s WHERE s.asset_id = a.id AND s.status = 'ACTIVE' AND s.is_active = true)
AND NOT EXISTS (SELECT 1 FROM `asset_request_allocations` r WHERE r.asset_id = a.id AND r.status IN ('RESERVED','ISSUED','CONFIRMED','RETURN_PENDING'));
