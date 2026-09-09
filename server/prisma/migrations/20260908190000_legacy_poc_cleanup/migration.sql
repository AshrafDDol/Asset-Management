-- Controlled cleanup after replacement of Asset Requests with Asset-first Issue Batches.
-- Preflight on the target DB identified 58 inactive automated fixture Assets, with
-- 15 closed assignments, 20 movements, one inactive EPC, no Issue Batch items,
-- no scan confirmations, and no active assignments.

-- Remove dependants for only the inspected, uniquely named fixture Assets.
DELETE FROM `asset_scan_confirmations`
WHERE `asset_id` IN (
  SELECT `id` FROM `assets` WHERE
    `asset_code` = 'TASSET-1787821313280'
    OR `asset_code` LIKE 'ALASSET-%-1787902624751'
    OR `asset_code` LIKE 'ISSUE-1787904260739-%'
    OR `asset_code` LIKE 'RETURN-1787906408253-%'
    OR `asset_code` LIKE 'AMEND-1788322312428-%'
    OR `asset_code` LIKE 'AMEND-1788322340572-%'
    OR `asset_code` IN (
      'POC-1788336027436-WRONG-CAT',
      'POC-1788336027436-WRONG-H',
      'POC-1788336027436-WRONG-W',
      'POC-1788336027436-ALREADY-RES',
      'POC-1788336027436-ALREADY-USE',
      'POC-1788336027436-INACTIVE',
      'POC-1788336027436-CONCURRENT',
      'POC-1788336027436-CANCELLED-ALLOC'
    )
);

DELETE FROM `asset_movements`
WHERE `asset_id` IN (
  SELECT `id` FROM `assets` WHERE
    `asset_code` = 'TASSET-1787821313280'
    OR `asset_code` LIKE 'ALASSET-%-1787902624751'
    OR `asset_code` LIKE 'ISSUE-1787904260739-%'
    OR `asset_code` LIKE 'RETURN-1787906408253-%'
    OR `asset_code` LIKE 'AMEND-1788322312428-%'
    OR `asset_code` LIKE 'AMEND-1788322340572-%'
    OR `asset_code` IN (
      'POC-1788336027436-WRONG-CAT', 'POC-1788336027436-WRONG-H',
      'POC-1788336027436-WRONG-W', 'POC-1788336027436-ALREADY-RES',
      'POC-1788336027436-ALREADY-USE', 'POC-1788336027436-INACTIVE',
      'POC-1788336027436-CONCURRENT', 'POC-1788336027436-CANCELLED-ALLOC'
    )
);

DELETE FROM `asset_assignments`
WHERE `asset_id` IN (
  SELECT `id` FROM `assets` WHERE
    `asset_code` = 'TASSET-1787821313280'
    OR `asset_code` LIKE 'ALASSET-%-1787902624751'
    OR `asset_code` LIKE 'ISSUE-1787904260739-%'
    OR `asset_code` LIKE 'RETURN-1787906408253-%'
    OR `asset_code` LIKE 'AMEND-1788322312428-%'
    OR `asset_code` LIKE 'AMEND-1788322340572-%'
    OR `asset_code` IN (
      'POC-1788336027436-WRONG-CAT', 'POC-1788336027436-WRONG-H',
      'POC-1788336027436-WRONG-W', 'POC-1788336027436-ALREADY-RES',
      'POC-1788336027436-ALREADY-USE', 'POC-1788336027436-INACTIVE',
      'POC-1788336027436-CONCURRENT', 'POC-1788336027436-CANCELLED-ALLOC'
    )
);

DELETE FROM `asset_epcs`
WHERE `asset_id` IN (
  SELECT `id` FROM `assets` WHERE
    `asset_code` = 'TASSET-1787821313280'
    OR `asset_code` LIKE 'ALASSET-%-1787902624751'
    OR `asset_code` LIKE 'ISSUE-1787904260739-%'
    OR `asset_code` LIKE 'RETURN-1787906408253-%'
    OR `asset_code` LIKE 'AMEND-1788322312428-%'
    OR `asset_code` LIKE 'AMEND-1788322340572-%'
    OR `asset_code` IN (
      'POC-1788336027436-WRONG-CAT', 'POC-1788336027436-WRONG-H',
      'POC-1788336027436-WRONG-W', 'POC-1788336027436-ALREADY-RES',
      'POC-1788336027436-ALREADY-USE', 'POC-1788336027436-INACTIVE',
      'POC-1788336027436-CONCURRENT', 'POC-1788336027436-CANCELLED-ALLOC'
    )
);

DELETE FROM `assets` WHERE
  `asset_code` = 'TASSET-1787821313280'
  OR `asset_code` LIKE 'ALASSET-%-1787902624751'
  OR `asset_code` LIKE 'ISSUE-1787904260739-%'
  OR `asset_code` LIKE 'RETURN-1787906408253-%'
  OR `asset_code` LIKE 'AMEND-1788322312428-%'
  OR `asset_code` LIKE 'AMEND-1788322340572-%'
  OR `asset_code` IN (
    'POC-1788336027436-WRONG-CAT', 'POC-1788336027436-WRONG-H',
    'POC-1788336027436-WRONG-W', 'POC-1788336027436-ALREADY-RES',
    'POC-1788336027436-ALREADY-USE', 'POC-1788336027436-INACTIVE',
    'POC-1788336027436-CONCURRENT', 'POC-1788336027436-CANCELLED-ALLOC'
  );

-- Remove obsolete Issue Batch return-initiation/swap metadata. No SWAP or
-- replacement rows existed at preflight; direct Return Scan is now authoritative.
ALTER TABLE `issue_batch_items`
  DROP FOREIGN KEY `issue_batch_items_replacement_for_item_id_fkey`;
DROP INDEX `issue_batch_items_replacement_for_item_id_idx` ON `issue_batch_items`;
ALTER TABLE `issue_batch_items`
  DROP COLUMN `return_purpose`,
  DROP COLUMN `swap_reason`,
  DROP COLUMN `swap_remarks`,
  DROP COLUMN `replacement_for_item_id`;

-- BladeSku was only reachable through this nullable legacy Asset association.
ALTER TABLE `assets` DROP FOREIGN KEY `assets_blade_sku_id_fkey`;
DROP INDEX `assets_blade_sku_id_idx` ON `assets`;
ALTER TABLE `assets` DROP COLUMN `blade_sku_id`;
DROP TABLE `blade_skus`;

-- Machine was a standalone obsolete master with no foreign-key consumers.
DROP TABLE `machines`;

-- Remove exact inactive test masters after their proven fixture dependants.
DELETE FROM `users` WHERE `username` IN (
  'ISSUE-1787904260739-issuer', 'ISSUE-1787904260739-recipient',
  'ISSUE-1787904260739-inactive', 'RETURN-1787906408253-user',
  'AMEND-1788322312428-u1', 'AMEND-1788322312428-u2',
  'AMEND-1788322340572-u1', 'AMEND-1788322340572-u2',
  'POC-1788336027436-login'
);

DELETE FROM `locations` WHERE `location_code` IN (
  'TCHILD-1787821313280', 'ALRACK-1787902624751',
  'ISSUE-1787904260739-STORE', 'ISSUE-1787904260739-PROD',
  'ISSUE-1787904260739-INACTIVE', 'RETURN-1787906408253-PROD',
  'RETURN-1787906408253-STORE', 'RETURN-1787906408253-INACTIVE',
  'AMEND-1788322312428-STORE', 'AMEND-1788322312428-PROD',
  'AMEND-1788322340572-STORE', 'AMEND-1788322340572-PROD'
);
DELETE FROM `locations` WHERE `location_code` IN ('TROOT-1787821313280', 'ALSTORE-1787902624751');

DELETE FROM `departments` WHERE `department_code` IN (
  'ISSUE-1787904260739-DEPT', 'RETURN-1787906408253-DEPT',
  'AMEND-1788322312428-D', 'AMEND-1788322340572-D'
);

DELETE FROM `roles` WHERE `name` IN (
  'ISSUE-1787904260739-ROLE', 'RETURN-1787906408253-ROLE',
  'AMEND-1788322312428-ROLE', 'AMEND-1788322340572-ROLE'
);

DELETE FROM `asset_categories` WHERE `category_code` IN (
  'TC-1787821313280', 'TIC-1787821313280', 'RQCAT-1787901652914',
  'ALCAT-1787902624751', 'ISSUE-1787904260739-CAT',
  'RETURN-1787906408253-CAT', 'AMEND-1788322312428-BLADE',
  'AMEND-1788322312428-MOTOR', 'AMEND-1788322340572-BLADE',
  'AMEND-1788322340572-MOTOR', 'POC-1788336027436-OTHER'
);
