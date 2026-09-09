-- Record the direct old-item to replacement-item relationship for the focused Swap workflow.
ALTER TABLE `issue_batch_items` ADD COLUMN `replacement_for_item_id` INTEGER NULL;
CREATE UNIQUE INDEX `issue_batch_items_replacement_for_item_id_key` ON `issue_batch_items`(`replacement_for_item_id`);
ALTER TABLE `issue_batch_items`
  ADD CONSTRAINT `issue_batch_items_replacement_for_item_id_fkey`
  FOREIGN KEY (`replacement_for_item_id`) REFERENCES `issue_batch_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
