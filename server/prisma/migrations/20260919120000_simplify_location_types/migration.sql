-- Expand the enum first so existing rows can be mapped without deleting or
-- recreating any Location records referenced by lifecycle/history tables.
ALTER TABLE `locations`
  MODIFY `location_type` ENUM(
    'STORE', 'WAREHOUSE', 'RACK', 'LEVEL', 'BIN', 'FILE',
    'PRODUCTION_AREA', 'MACHINE_LOCATION', 'OTHER',
    'STORAGE', 'OPERATION', 'REPAIR'
  ) NOT NULL DEFAULT 'STORAGE';

-- Explicit repair locations are identified by their existing repair records.
-- FILE and non-repair OTHER are POC storage locations and migrate to STORAGE.
UPDATE `locations` AS `location`
SET `location`.`location_type` = CASE
  WHEN `location`.`location_type` IN ('PRODUCTION_AREA', 'MACHINE_LOCATION') THEN 'OPERATION'
  WHEN `location`.`location_type` = 'OTHER'
    AND EXISTS (
      SELECT 1
      FROM `asset_repairs` AS `repair`
      WHERE `repair`.`repair_location_id` = `location`.`id`
    ) THEN 'REPAIR'
  ELSE 'STORAGE'
END;

ALTER TABLE `locations`
  MODIFY `location_type` ENUM('STORAGE', 'OPERATION', 'REPAIR') NOT NULL DEFAULT 'STORAGE';
