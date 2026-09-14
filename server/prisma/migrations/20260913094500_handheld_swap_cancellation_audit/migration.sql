ALTER TABLE `handheld_swap_tasks`
  ADD COLUMN `cancelled_by_user_id` INTEGER NULL,
  ADD COLUMN `cancelled_at` DATETIME(3) NULL,
  ADD COLUMN `cancellation_reason` VARCHAR(191) NULL;

CREATE INDEX `handheld_swap_tasks_cancelled_by_user_id_idx`
  ON `handheld_swap_tasks`(`cancelled_by_user_id`);

ALTER TABLE `handheld_swap_tasks`
  ADD CONSTRAINT `handheld_swap_tasks_cancelled_by_user_id_fkey`
  FOREIGN KEY (`cancelled_by_user_id`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
