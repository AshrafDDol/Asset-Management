import { prisma } from "../../config/prisma";
import { EpcStatus } from "@prisma/client";
import { AppError } from "../../utils/AppError";
import { CreateAssetEpcInput, UpdateAssetEpcInput } from "./assetEpc.types";

const ASSET_EPC_SELECT = {
    id: true,
    epcCode: true,
    assetId: true,
    status: true,
    assignedAt: true,
    unassignedAt: true,
    remarks: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,

    asset: {
        select: {
            id: true,
            assetCode: true,
            itemName: true,
            serialNumber: true,
            brand: true,
            model: true,
            status: true,
            condition: true,

            category: {
                select: {
                    id: true,
                    categoryCode: true,
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
        },
    },
};

function validateEpcStatus(status?: string) {
    if (!status) return undefined;

    if (!Object.values(EpcStatus).includes(status as EpcStatus)) {
        throw new AppError("Invalid EPC status", 400);
    }

    return status as EpcStatus;
}

function normalizeEpcCode(epcCode?: string) {
    return epcCode?.trim().toUpperCase();
}

export async function getAllAssetEpcs() {
    const assetEpcs = await prisma.assetEpc.findMany({
        select: ASSET_EPC_SELECT,
        orderBy: {
            id: "desc",
        },
    });

    return assetEpcs;
}

export async function getAssetEpcById(id: number) {
    if (!id) {
        throw new AppError("Invalid EPC ID", 400);
    }

    const assetEpc = await prisma.assetEpc.findUnique({
        where: { id },
        select: ASSET_EPC_SELECT,
    });

    if (!assetEpc) {
        throw new AppError("Asset EPC not found", 404);
    }

    return assetEpc;
}

export async function getAssetEpcByCode(epcCodeParam: string) {
    const epcCode = normalizeEpcCode(epcCodeParam);

    if (!epcCode) {
        throw new AppError("EPC code is required", 400);
    }

    const assetEpc = await prisma.assetEpc.findUnique({
        where: { epcCode },
        select: ASSET_EPC_SELECT,
    });

    if (!assetEpc) {
        throw new AppError("Asset EPC not found", 404);
    }

    return assetEpc;
}

export async function createAssetEpc(input: CreateAssetEpcInput) {
    const epcCode = normalizeEpcCode(input.epcCode);

    if (!epcCode) {
        throw new AppError("EPC code is required", 400);
    }

    if (!input.assetId) {
        throw new AppError("Asset ID is required", 400);
    }

    const asset = await prisma.asset.findUnique({
        where: { id: input.assetId },
    });

    if (!asset || !asset.isActive) {
        throw new AppError("Asset not found or inactive", 404);
    }

    const existingEpc = await prisma.assetEpc.findUnique({
        where: { epcCode },
    });

    if (existingEpc) {
        throw new AppError("EPC code already exists", 400);
    }

    const existingAssetEpc = await prisma.assetEpc.findUnique({
        where: { assetId: input.assetId },
    });

    if (existingAssetEpc) {
        throw new AppError("Asset already has an EPC assigned", 400);
    }

    const assetEpc = await prisma.assetEpc.create({
        data: {
            epcCode,
            assetId: input.assetId,
            status: validateEpcStatus(input.status),
            remarks: input.remarks,
        },

        select: ASSET_EPC_SELECT,
    });

    return assetEpc;
}

export async function updateAssetEpc (
    id: number,
    input: UpdateAssetEpcInput
) {
    if (!id) {
        throw new AppError("Invalid Asset EPC ID", 400);
    }

    const existingAssetEpc = await prisma.assetEpc.findUnique({
        where: { id },
    });

    if (!existingAssetEpc) {
        throw new AppError("Asset EPC not found", 404);
    }

    const epcCode = normalizeEpcCode(input.epcCode);

    if (epcCode) {
        const duplicateEpc = await prisma.assetEpc.findFirst({
            where: { 
                epcCode, 
                id: { 
                    not: id
                },
            },
        });

        if (duplicateEpc) {
            throw new AppError("EPC code already exists", 409);
        }
    }

    if (input.assetId) {
        const asset = await prisma.asset.findUnique({
            where: { id: input.assetId },
        });

        if (!asset || !asset.isActive) {
            throw new AppError("Asset not found or inactive", 404);
        }

        const duplicateAssetEpc = await prisma.assetEpc.findFirst({
            where: { 
                assetId: input.assetId,
                id: { 
                    not: id
                },
            },
        });

        if (duplicateAssetEpc) {
            throw new AppError("Asset already has an EPC assigned", 409);
        }
    }

    const status = validateEpcStatus(input.status);

    const assetEpc = await prisma.assetEpc.update({
        where: { id },
        data: {
            epcCode,
            assetId: input.assetId,
            status,
            remarks: input.remarks,
            isActive: input.isActive,
            unassignedAt: input.isActive === false ? new Date() : undefined,
        },

        select: ASSET_EPC_SELECT,
    });

    return assetEpc;
}

export async function deleteAssetEpc(id: number) {
    if (!id) {
        throw new AppError("Invalid Asset EPC ID", 400);
    }

    const existingAssetEpc = await prisma.assetEpc.findUnique({
        where: { id },
    });

    if (!existingAssetEpc) {
        throw new AppError("Asset EPC not found", 404);
    }

    const assetEpc = await prisma.assetEpc.update({
        where: { id },
        data: {
            isActive: false,
            status: "INACTIVE",
            unassignedAt: new Date(),
        },

        select: ASSET_EPC_SELECT,
    });
    
    return assetEpc;
}
