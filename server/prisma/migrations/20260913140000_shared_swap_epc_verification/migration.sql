ALTER TABLE `handheld_swap_tasks`
    ADD COLUMN `old_verified_epc` VARCHAR(191) NULL,
    ADD COLUMN `old_verified_at` DATETIME(3) NULL,
    ADD COLUMN `old_verified_source` ENUM('WEB_ADMIN', 'HANDHELD') NULL,
    ADD COLUMN `new_verified_epc` VARCHAR(191) NULL,
    ADD COLUMN `new_verified_at` DATETIME(3) NULL,
    ADD COLUMN `new_verified_source` ENUM('WEB_ADMIN', 'HANDHELD') NULL;
