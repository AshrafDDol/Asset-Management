import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { CreateAssetCategoryInput, UpdateAssetCategoryInput } from "./assetCategories.types";

export async function getAllAssetCategories() {
    const categories = await prisma.assetCategory.findMany({
        orderBy: {
            id: "desc",
        },
    });

    return categories;
}

export async function getAssetCategoryById(id: number) {
    if (!id) {
        throw new AppError("Invalid category Id", 400);
    }

    const category = await prisma.assetCategory.findUnique({
        where: {
            id,
        }
    });

    if (!category) {
        throw new AppError("Asset category not found", 404);
    }

    return category;
}

export async function createAssetCategory(input: CreateAssetCategoryInput) {
    const categoryCode = input.categoryCode.trim().toUpperCase();
    const name = input.name.trim();

    if (!categoryCode) {
        throw new AppError("Category code is required", 400);
    }

    if (!name) {
        throw new AppError("Category name is required", 400);
    }

    const existingCategory = await prisma.assetCategory.findUnique({
        where: {
            categoryCode,
        },
    });

    if (existingCategory) {
        throw new AppError("Asset category with this code already exists", 400);
    }

    const category = await prisma.assetCategory.create({
        data: {
            categoryCode,
            name,
            description: input.description,
        },
    });

    return category;
}

export async function updateAssetCategory(
    id: number,
    input: UpdateAssetCategoryInput
){
    if (!id) {
        throw new AppError("Invalid category Id", 400);
    }

    const existingCategory = await prisma.assetCategory.findUnique({
        where: {
            id,
        },
    });

    if (!existingCategory) {
        throw new AppError("Asset category not found", 404);
    }

    let newCategoryCode = input.categoryCode;

    if (newCategoryCode) {
        newCategoryCode = newCategoryCode.trim().toUpperCase();

        const duplicateCategory = await prisma.assetCategory.findFirst({
            where: {
                categoryCode: newCategoryCode,
                id: {
                    not: id,
                },
            },
        });


        if (duplicateCategory) {
            throw new AppError("Asset category with this code already exists", 400);
        }
    }

    const category = await prisma.assetCategory.update({
        where: { id },
        data: {
            categoryCode: newCategoryCode,
            name: input.name,
            description: input.description,
            isActive: input.isActive,
        },
    });

    return category;
}

export async function deleteAssetCategory(id: number) {
    if (!id) {
        throw new AppError("Invalid category Id", 400);
    }

    const existingCategory = await prisma.assetCategory.findUnique({
        where: { id },
    });

    if (!existingCategory) {
        throw new AppError("Asset category not found", 404);
    }

    const category = await prisma.assetCategory.update({
        where: { id },
        data: {
            isActive: false,
        },
    });

    return category;
}