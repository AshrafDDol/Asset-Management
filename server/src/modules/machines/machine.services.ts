import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { CreateMachineInput, UpdateMachineInput } from "./machine.types";

export async function getAllMachines() {
  return prisma.machine.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getMachineById(id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new AppError("Invalid machine ID", 400);
  const machine = await prisma.machine.findUnique({ where: { id } });
  if (!machine) throw new AppError("Machine not found", 404);
  return machine;
}

export async function createMachine(input: CreateMachineInput) {
  const machineCode = input.machineCode?.trim().toUpperCase();
  const machineName = input.machineName?.trim();
  if (!machineCode) throw new AppError("Machine code is required", 400);
  if (!machineName) throw new AppError("Machine name is required", 400);
  if (await prisma.machine.findUnique({ where: { machineCode } })) {
    throw new AppError("Machine code already exists", 409);
  }
  return prisma.machine.create({
    data: { machineCode, machineName, description: input.description?.trim() || null },
  });
}

export async function updateMachine(id: number, input: UpdateMachineInput) {
  const existing = await getMachineById(id);
  const machineCode = input.machineCode?.trim().toUpperCase();
  const machineName = input.machineName?.trim();
  if (input.machineCode !== undefined && !machineCode) throw new AppError("Machine code is required", 400);
  if (input.machineName !== undefined && !machineName) throw new AppError("Machine name is required", 400);
  if (machineCode && machineCode !== existing.machineCode && await prisma.machine.findUnique({ where: { machineCode } })) {
    throw new AppError("Machine code already exists", 409);
  }
  return prisma.machine.update({
    where: { id },
    data: {
      machineCode,
      machineName,
      description: input.description === undefined ? undefined : input.description.trim() || null,
      isActive: input.isActive,
    },
  });
}

export async function deleteMachine(id: number) {
  await getMachineById(id);
  return prisma.machine.update({ where: { id }, data: { isActive: false } });
}
