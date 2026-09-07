ALTER TABLE `locations`
    ADD COLUMN `department_id` INTEGER NULL;

CREATE INDEX `locations_department_id_idx`
    ON `locations`(`department_id`);

ALTER TABLE `locations`
    ADD CONSTRAINT `locations_department_id_fkey`
    FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `assets`
    DROP FOREIGN KEY `assets_department_id_fkey`;

DROP INDEX `assets_department_id_idx`
    ON `assets`;

ALTER TABLE `assets`
    DROP COLUMN `department_id`;
