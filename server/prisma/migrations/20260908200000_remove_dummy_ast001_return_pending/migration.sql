-- Remove the final inspected dummy Asset graph. AST-001 has no Issue Batch item
-- or scan-confirmation links; all of its assignments and movements belong only
-- to this dummy Asset, including active legacy Assignment 124.
DELETE FROM `asset_scan_confirmations`
WHERE `asset_id` = (SELECT `id` FROM `assets` WHERE `asset_code` = 'AST-001');

DELETE FROM `asset_movements`
WHERE `asset_id` = (SELECT `id` FROM `assets` WHERE `asset_code` = 'AST-001');

DELETE FROM `asset_assignments`
WHERE `asset_id` = (SELECT `id` FROM `assets` WHERE `asset_code` = 'AST-001');

DELETE FROM `asset_epcs`
WHERE `asset_id` = (SELECT `id` FROM `assets` WHERE `asset_code` = 'AST-001');

DELETE FROM `assets` WHERE `asset_code` = 'AST-001';

-- No remaining rows use RETURN_PENDING. Keep the rest of each historical enum
-- unchanged while removing only the obsolete state.
ALTER TABLE `assets`
  MODIFY `status` ENUM(
    'AVAILABLE', 'RESERVED', 'PENDING_CONFIRMATION', 'ASSIGNED', 'IN_USE',
    'UNDER_MAINTENANCE', 'LOST', 'DISPOSED'
  ) NOT NULL DEFAULT 'AVAILABLE';

ALTER TABLE `issue_batch_items`
  MODIFY `status` ENUM(
    'RESERVED', 'ISSUED', 'CONFIRMED', 'RETURNED', 'CANCELLED'
  ) NOT NULL DEFAULT 'RESERVED';
