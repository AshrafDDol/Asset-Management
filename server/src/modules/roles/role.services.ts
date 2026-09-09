import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { CreateRoleInput, UpdateRoleInput } from "./role.types";

export async function getAllRoles () {
    const roles = await prisma.role.findMany({
        orderBy: {
            createdAt: "desc",
        },
    });
    return roles;
}


export async function getRoleById (id: number) {
    if (!id) {
        throw new AppError("Invalid role ID", 400);
    }

    const role = await prisma.role.findUnique({
        where: { id },
    });

    if (!role) {
        throw new AppError("Role not found", 404);
    }

    return role;
}

export async function createRole (input: CreateRoleInput) {
    const name = input.name?.trim();

    if (!name) {
        throw new AppError("Role name is required", 400);
    }

    const existingRole = await prisma.role.findUnique({
        where: { name },
    });

    if (existingRole) {
        throw new AppError("Role name already exists", 400);
    }

    const role = await prisma.role.create({
        data: {
            name,
            description: input.description,
        },
    });

    return role;
}

export async function updateRole (
    id: number,
    input: UpdateRoleInput
){
    if (!id) {
        throw new AppError("Invalid role ID", 400);
    }

    const existingRole = await prisma.role.findUnique({
        where: { id },
    });

    if (!existingRole) {
        throw new AppError("Role not found", 404);
    }

    if (input.name) {
        const duplicateRole = await prisma.role.findFirst({
            where: {
                name: input.name.trim(),
                id: { not: id },
            },
        });

        if (duplicateRole) {
            throw new AppError("Role name already exists", 400);
        }
    }

    const role = await prisma.role.update({
        where: { id },
        data: {
            name: input.name?.trim(),
            description: input.description,
            isActive: input.isActive,
        },
    });

    return role;
}

export async function deleteRole (id: number) {
    if (!id) {
        throw new AppError("Invalid role ID", 400);
    }

    const existingRole = await prisma.role.findUnique({
        where: { id },
    });

    if (!existingRole) {
        throw new AppError("Role not found", 404);
    }

    try {
        return await prisma.$transaction(async (tx) => {
            if (await tx.user.count({ where: { roleId: id } })) {
                throw new AppError("Cannot delete this Role because it is assigned to a User.", 409);
            }
            return tx.role.delete({ where: { id } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
            throw new AppError("Cannot delete this Role because another record references it.", 409);
        }
        throw error;
    }
}
