import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import {
  BladeSkuFilters,
  CreateBladeSkuInput,
  UpdateBladeSkuInput,
} from "./bladeSku.types";

const BLADE_SKU_INCLUDE = {
  category: {
    select: {
      id: true,
      categoryCode: true,
      name: true,
      isActive: true,
    },
  },
};

async function validateActiveCategory(categoryId: number) {
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    throw new AppError("Asset category is required", 400);
  }

  const category = await prisma.assetCategory.findUnique({ where: { id: categoryId } });
  if (!category || !category.isActive) {
    throw new AppError("Invalid or inactive asset category", 400);
  }
}

export async function getAllBladeSkus(filters: BladeSkuFilters = {}) {
  return prisma.bladeSku.findMany({
    where: {
      isActive: filters.active,
      categoryId: filters.categoryId,
      OR: filters.search
        ? [
            { skuCode: { contains: filters.search } },
            { name: { contains: filters.search } },
            { bladeType: { contains: filters.search } },
            { specification: { contains: filters.search } },
          ]
        : undefined,
    },
    include: BLADE_SKU_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getBladeSkuById(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Invalid Blade SKU ID", 400);

  const bladeSku = await prisma.bladeSku.findUnique({
    where: { id },
    include: BLADE_SKU_INCLUDE,
  });
  if (!bladeSku) throw new AppError("Blade SKU not found", 404);
  return bladeSku;
}

export async function createBladeSku(input: CreateBladeSkuInput) {
  const skuCode = input.skuCode?.trim().toUpperCase();
  const name = input.name?.trim();
  if (!skuCode) throw new AppError("SKU code is required", 400);
  if (!name) throw new AppError("Blade SKU name is required", 400);

  await validateActiveCategory(Number(input.categoryId));
  const duplicate = await prisma.bladeSku.findUnique({ where: { skuCode } });
  if (duplicate) throw new AppError("Blade SKU code already exists", 409);

  return prisma.bladeSku.create({
    data: {
      skuCode,
      name,
      categoryId: Number(input.categoryId),
      bladeType: input.bladeType?.trim() || null,
      specification: input.specification?.trim() || null,
      remarks: input.remarks?.trim() || null,
    },
    include: BLADE_SKU_INCLUDE,
  });
}

export async function updateBladeSku(id: number, input: UpdateBladeSkuInput) {
  const existing = await getBladeSkuById(id);
  const skuCode = input.skuCode?.trim().toUpperCase();
  const name = input.name?.trim();
  if (input.skuCode !== undefined && !skuCode) throw new AppError("SKU code is required", 400);
  if (input.name !== undefined && !name) throw new AppError("Blade SKU name is required", 400);

  if (input.categoryId !== undefined) await validateActiveCategory(Number(input.categoryId));
  if (skuCode && skuCode !== existing.skuCode) {
    const duplicate = await prisma.bladeSku.findUnique({ where: { skuCode } });
    if (duplicate) throw new AppError("Blade SKU code already exists", 409);
  }

  return prisma.bladeSku.update({
    where: { id },
    data: {
      skuCode,
      name,
      categoryId: input.categoryId === undefined ? undefined : Number(input.categoryId),
      bladeType: input.bladeType === undefined ? undefined : input.bladeType.trim() || null,
      specification: input.specification === undefined ? undefined : input.specification.trim() || null,
      remarks: input.remarks === undefined ? undefined : input.remarks.trim() || null,
      isActive: input.isActive,
    },
    include: BLADE_SKU_INCLUDE,
  });
}

export async function deleteBladeSku(id: number) {
  await getBladeSkuById(id);
  return prisma.bladeSku.update({
    where: { id },
    data: { isActive: false },
    include: BLADE_SKU_INCLUDE,
  });
}
