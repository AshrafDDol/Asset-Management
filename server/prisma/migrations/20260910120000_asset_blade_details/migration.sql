-- Optional Blade Details for Asset master data. Existing Assets remain valid with NULL values.
ALTER TABLE `assets`
  ADD COLUMN `grid_up` INTEGER NULL,
  ADD COLUMN `radius` DECIMAL(10, 2) NULL,
  ADD COLUMN `gap_mm` DECIMAL(10, 2) NULL;
