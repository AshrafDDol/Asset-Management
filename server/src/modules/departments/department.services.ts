import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { CreateDepartmentInput, UpdateDepartmentInput } from "./department.types";

export async function getAllDepartments() {
    const departments = await prisma.department.findMany({
        orderBy: {
            name: "asc",
        },
    });
    return departments;
}

export async function getDepartmentById(id: number) {
    if(!id) {
        throw new AppError("Invalid department id", 400);
    }

    const department = await prisma.department.findUnique({
        where: { id },
    });

    if (!department) {
        throw new AppError("Department not found", 404);
    }

    return department;
}

export async function createDepartment(input: CreateDepartmentInput) {
    const departmentCode = input.departmentCode?.trim().toUpperCase();
    const name = input.name?.trim();

    if(!departmentCode) {
        throw new AppError("Department code is required", 400);
    }

    if (!name) {
        throw new AppError("Department name is required", 400);
    }

    const existingDepartment = await prisma.department.findUnique({
        where: { departmentCode },
    });

    if (existingDepartment) {
        throw new AppError("Department code already exists", 409);
    }

    const department = await prisma.department.create({
        data: {
            departmentCode,
            name,
            description: input.description,
        },
    });

    return department;
}

export async function updateDepartment(
    id: number,
    input: UpdateDepartmentInput
){
    if (!id) {
        throw new AppError("Invalid department id", 400);
    }

    const existingDepartment = await prisma.department.findUnique({
        where: { id },
    });

    if (!existingDepartment) {
        throw new AppError("Department not found", 404);
    }

    let newDepartmentCode = input.departmentCode;

    if (newDepartmentCode) {
        newDepartmentCode = newDepartmentCode.trim().toUpperCase();

        const duplicateDepartment = await prisma.department.findFirst({
            where: {
                departmentCode: newDepartmentCode,
                id: { not: id },
            },
        });

        if (duplicateDepartment) {
            throw new AppError("Department code already exists", 409);
        }
    }

    const department = await prisma.department.update({
        where: { id },
        data: {
            departmentCode: newDepartmentCode,
            name: input.name,
            description: input.description,
            isActive: input.isActive,
        },
    });

    return department;
}

export async function deleteDepartment(
    id: number
){
    if (!id) {
        throw new AppError("Invalid department id", 400);
    }

    const existingDepartment = await prisma.department.findUnique({
        where: { id },
    });

    if (!existingDepartment) {
        throw new AppError("Department not found", 404);
    }

    const department = await prisma.department.update({
        where: { id },
        data: {
            isActive: false,
        },
    });

    return department;
}