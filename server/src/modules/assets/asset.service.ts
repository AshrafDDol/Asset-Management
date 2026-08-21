import { AssetCondition, AssetStatus } from "@prisma/client";
import { AppError } from "../../utils/AppError";
import { prisma } from "../../config/prisma";
import { CreateAssetInput, UpdateAssetInput } from "./asset.types";

const ASSET_SELECT = {
    id: true,
    assetCode: true,
    itemName: true,
    categoryId: true,
    departmentId: true,
    locationId: true,
    serialNumber: true,
    brand: true,
    model: true,
    purchaseDate: true,
    purchaseCost: true,
    status: true,
    condition: true,
    remarks: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,

    category: {
        select: {
            id: true,
            categoryCode: true,
            name: true,
        },
    },

    department: {
        select: {
            id: true,
            departmentCode: true,
            name: true,
        },
    },

    location: {
        select: {
            id: true,
            locationCode: true,
            name: true,
        },
    },
};

function validateStatus(status?: string) {
    if (!status) return undefined;

    if (!Object.values(AssetStatus).includes(status as AssetStatus)) {
        throw new AppError("Invalid asset status", 400);
    }

    return status as AssetStatus;
}

function validateCondition(condition?: string) {
    if (!condition) return undefined;

    if (!Object.values(AssetCondition).includes(condition as AssetCondition)) {
        throw new AppError("Invalid asset condition", 400);
    }

    return condition as AssetCondition;
}

function parsePurchaseDate(purchaseDate?: string) {
    if (!purchaseDate) return undefined;

    const date = new Date(purchaseDate);

    if (Number.isNaN(date.getTime())) {
        throw new AppError("Invalid purchase date", 400);
    }

    return date;
}

async function validateAssetReferences(
    categoryId?: number,
    departmentId?: number,
    locationId?: number,
) {
    if (categoryId) {
        const category = await prisma.assetCategory.findUnique({
            where: { id: categoryId },
        });

        if (!category || !category.isActive) {
            throw new AppError("Invalid or inactive asset category", 400);
        }
    }

    if (departmentId) {
        const department = await prisma.department.findUnique({
            where: { id: departmentId },
        });

        if (!department || !department.isActive) {
            throw new AppError("Invalid or inactive department", 400);
        }
    }

    if (locationId) {
        const location = await prisma.location.findUnique({
            where: { id: locationId },
        });

        if (!location || !location.isActive) {
            throw new AppError("Invalid or inactive location", 400);
        }
    }
}

export async function getAllAssets() {
    const assets = await prisma.asset.findMany({
        select: ASSET_SELECT,
        orderBy: {
            createdAt: "desc",
        },
    });

    return assets;
}

export async function getAssetById(id: number) {
    if (!id) {
        throw new AppError("Invalid asset ID", 400);
    }

    const asset = await prisma.asset.findUnique({
        where: { id },
        select: ASSET_SELECT,
    });

    if (!asset) {
        throw new AppError("Asset not found", 404);
    }

    return asset;
}

export async function createAsset(input: CreateAssetInput) {
    const assetCode = input.assetCode?.trim();
    const itemName = input.itemName?.trim();
    const serialNumber = input.serialNumber?.trim();

    if (!assetCode) {
        throw new AppError("Asset code is required", 400);
    }

    if (!itemName) {
        throw new AppError("Item name is required", 400);
    }

    if (!input.categoryId) {
        throw new AppError("Asset category is required", 400);
    }

    const existingAssetCode = await prisma.asset.findUnique({
        where: { assetCode },
    });

    if (existingAssetCode) {
        throw new AppError("Asset code already exists", 400);
    }

    if (serialNumber) {
        const existingSerialNumber = await prisma.asset.findUnique({
            where: { serialNumber },
        });

        if (existingSerialNumber) {
            throw new AppError("Serial number already exists", 400);
        }
    }

    await validateAssetReferences(
        input.categoryId,
        input.departmentId,
        input.locationId,
    );

    const asset = await prisma.asset.create({
        data: {
            assetCode,
            itemName,
            categoryId: input.categoryId,
            departmentId: input.departmentId,
            locationId: input.locationId,
            serialNumber,
            brand: input.brand?.trim(),
            model: input.model?.trim(),
            purchaseDate: parsePurchaseDate(input.purchaseDate),
            purchaseCost: input.purchaseCost,
            status: validateStatus(input.status),
            condition: validateCondition(input.condition),
            remarks: input.remarks,
        },
        select: ASSET_SELECT,
    });

    return asset;
}

export async function updateAsset(
    id: number,
    input: UpdateAssetInput
) {
    if (!id) {
        throw new AppError("Invalid asset ID", 400);
    }

    const existingAsset = await prisma.asset.findUnique({
        where: { id },
    });

    if (!existingAsset) {
        throw new AppError("Asset not found", 404);
    }

    const assetCode = input.assetCode?.trim();
    const itemName = input.itemName?.trim();
    const serialNumber = input.serialNumber?.trim();

    if (assetCode) {
        const duplicateAssetCode = await prisma.asset.findFirst({
            where: {
                assetCode,
                id: {
                    not: id,
                },
            },
        })

        if (duplicateAssetCode) {
            throw new AppError("Asset code already exists", 409);
        }
    }

    if (serialNumber) {
        const duplicateSerialNumber = await prisma.asset.findFirst({
            where: {
                serialNumber,
                id: {
                    not: id,
                },
            },
        });

        if (duplicateSerialNumber) {
            throw new AppError("Serial number already exists", 409);    
        }
    }

    await validateAssetReferences(
        input.categoryId,
        input.departmentId,
        input.locationId
    );

    const asset = await prisma.asset.update({
        where: { id },
        data: {
            assetCode,
            itemName,
            categoryId: input.categoryId,
            departmentId: input.departmentId,
            locationId: input.locationId,
            serialNumber,
            brand: input.brand?.trim(),
            model: input.model?.trim(),
            purchaseDate: parsePurchaseDate(input.purchaseDate),
            purchaseCost: input.purchaseCost,
            status: validateStatus(input.status),
            condition: validateCondition(input.condition),
            remarks: input.remarks,
            isActive: input.isActive,
        },
        select: ASSET_SELECT,
    });

    return asset;
} 

export async function deleteAsset(id: number) {
    if (!id) {
        throw new AppError("Invalid asset ID", 400);
    }

    const existingAsset = await prisma.asset.findUnique({
        where: { id },
    });

    if (!existingAsset) {
        throw new AppError("Asset not found", 404);
    }

    const asset = await prisma.asset.update({
        where: { id },
        data: {
            isActive: false,
        },
        select: ASSET_SELECT,
    });

    return asset;
}