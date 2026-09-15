import { prisma } from "../../config/prisma";
import { AssetStatus, EpcStatus, Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { AppError } from "../../utils/AppError";
import { CreateAssetEpcInput, ManageAssetEpcInput, UpdateAssetEpcInput } from "./assetEpc.types";

const GENERATED_EPC_BYTES = 12;
const EPC_MUTABLE_ASSET_STATUSES: AssetStatus[] = [AssetStatus.AVAILABLE, AssetStatus.RESERVED];

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

export function normalizeEpcCode(epcCode?: string) {
    return epcCode?.trim().toUpperCase();
}

export function validateNewEpcCode(epcCode?: string) {
    const normalized = normalizeEpcCode(epcCode);
    if (!normalized) throw new AppError("EPC code is required", 400);
    if (!/^(?:[0-9A-F]{2})+$/.test(normalized)) throw new AppError("EPC code must contain an even number of hexadecimal characters (0-9, A-F)", 400);
    return normalized;
}

export function generateEpcCode() {
    return randomBytes(GENERATED_EPC_BYTES).toString("hex").toUpperCase();
}

function assertEpcMutableAsset(asset: { isActive: boolean; status: AssetStatus }) {
    if (!asset.isActive) throw new AppError("Asset not found or inactive", 404);
    if (!EPC_MUTABLE_ASSET_STATUSES.includes(asset.status)) {
        throw new AppError("EPC can only be assigned or replaced while the Asset is AVAILABLE or RESERVED", 409);
    }
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
    const epcCode = validateNewEpcCode(input.epcCode);

    if (!input.assetId) {
        throw new AppError("Asset ID is required", 400);
    }

    const asset = await prisma.asset.findUnique({
        where: { id: input.assetId },
    });

    if (!asset) throw new AppError("Asset not found or inactive", 404);
    assertEpcMutableAsset(asset);

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
        include: { asset: true },
    });

    if (!existingAssetEpc) {
        throw new AppError("Asset EPC not found", 404);
    }

    assertEpcMutableAsset(existingAssetEpc.asset);
    const epcCode = input.epcCode === undefined ? undefined : validateNewEpcCode(input.epcCode);

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

        if (!asset) throw new AppError("Asset not found or inactive", 404);
        assertEpcMutableAsset(asset);

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
        include: { asset: true },
    });

    if (!existingAssetEpc) {
        throw new AppError("Asset EPC not found", 404);
    }
    assertEpcMutableAsset(existingAssetEpc.asset);

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

export async function assignOrReplaceAssetEpc(assetId: number, input: ManageAssetEpcInput) {
    if (!Number.isInteger(assetId) || assetId <= 0) throw new AppError("Invalid Asset ID", 400);
    const manualEpc = input.epcCode ? validateNewEpcCode(input.epcCode) : null;
    if (manualEpc && input.autoGenerateEpc) throw new AppError("Choose Auto Generate EPC or Manual EPC Entry, not both", 400);
    if (!manualEpc && input.autoGenerateEpc !== true) throw new AppError("Choose Auto Generate EPC or provide a manual EPC", 400);

    const attempts = input.autoGenerateEpc ? 5 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const epcCode = manualEpc || generateEpcCode();
        try {
            return await prisma.$transaction(async (tx) => {
                const asset = await tx.asset.findUnique({ where: { id: assetId }, include: { epc: true } });
                if (!asset) throw new AppError("Asset not found", 404);
                assertEpcMutableAsset(asset);
                if (asset.epc?.isActive && asset.epc.status === EpcStatus.ACTIVE && asset.epc.epcCode === epcCode) {
                    throw new AppError("Replacement EPC must differ from the current active EPC", 400);
                }
                const duplicate = await tx.assetEpc.findUnique({ where: { epcCode } });
                if (duplicate && duplicate.assetId !== assetId) throw new AppError("EPC code already exists", 409);

                const data = {
                    epcCode,
                    status: EpcStatus.ACTIVE,
                    isActive: true,
                    assignedAt: new Date(),
                    unassignedAt: null,
                    remarks: input.remarks?.trim() || null,
                };
                return asset.epc
                    ? tx.assetEpc.update({ where: { id: asset.epc.id }, data, select: ASSET_EPC_SELECT })
                    : tx.assetEpc.create({ data: { ...data, assetId }, select: ASSET_EPC_SELECT });
            }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        } catch (error) {
            if (error instanceof AppError) throw error;
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                const generatedCodeCollision = input.autoGenerateEpc ? await prisma.assetEpc.findUnique({ where: { epcCode } }) : null;
                if (generatedCodeCollision && attempt < attempts - 1) continue;
                throw new AppError("EPC code already exists", 409);
            }
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
                throw new AppError("EPC assignment conflicted with another action; refresh and try again", 409);
            }
            throw error;
        }
    }
    throw new AppError("Could not generate a unique EPC; try again", 409);
}
