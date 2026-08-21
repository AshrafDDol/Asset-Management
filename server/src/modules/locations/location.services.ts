import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import {
  CreateLocationInput,
  UpdateLocationInput,
} from "./location.types";

export async function getAllLocations() {
  const locations = await prisma.location.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  return locations;
}

export async function getLocationById(id: number) {
  const location = await prisma.location.findUnique({
    where: { id },
  });

  if (!location) {
    throw new AppError("Location not found", 404);
  }

  return location;
}

export async function createLocation(input: CreateLocationInput) {
  const locationCode = input.locationCode.trim().toUpperCase();
  const name = input.name.trim();

  if (!locationCode) {
    throw new AppError("Location code is required", 400);
  }

  if (!name) {
    throw new AppError("Location name is required", 400);
  }

  const existingLocation = await prisma.location.findUnique({
    where: {
      locationCode,
    },
  });

  if (existingLocation) {
    throw new AppError("Location code already exists", 409);
  }

  const location = await prisma.location.create({
    data: {
      locationCode,
      name,
      description: input.description,
    },
  });

  return location;
}

export async function updateLocation(
  id: number,
  input: UpdateLocationInput
) {
  const existingLocation = await prisma.location.findUnique({
    where: { id },
  });

  if (!existingLocation) {
    throw new AppError("Location not found", 404);
  }

  let newLocationCode = input.locationCode;

  if (newLocationCode) {
    newLocationCode = newLocationCode.trim().toUpperCase();

    const duplicateLocation = await prisma.location.findFirst({
      where: {
        locationCode: newLocationCode,
        id: {
          not: id,
        },
      },
    });

    if (duplicateLocation) {
      throw new AppError("Location code already exists", 409);
    }
  }

  const location = await prisma.location.update({
    where: { id },
    data: {
      locationCode: newLocationCode,
      name: input.name,
      description: input.description,
      isActive: input.isActive,
    },
  });

  return location;
}

export async function deleteLocation(id: number) {
  const existingLocation = await prisma.location.findUnique({
    where: { id },
  });

  if (!existingLocation) {
    throw new AppError("Location not found", 404);
  }

  // Soft delete: we do not remove the location from database.
  // We only mark it inactive.
  const location = await prisma.location.update({
    where: { id },
    data: {
      isActive: false,
    },
  });

  return location;
}