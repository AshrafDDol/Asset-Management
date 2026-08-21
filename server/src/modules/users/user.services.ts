import bcrypt from "bcrypt";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { CreateUserInput, UpdateUserInput } from "./user.types";

const USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  roleId: true,
  departmentId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  role: {
    select: {
      id: true,
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
};

export async function getAllUsers() {
  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: {
      createdAt: "desc",
    },
  });

  return users;
}

export async function getUserById(id: number) {
  if (!id) {
    throw new AppError("Invalid user ID", 400);
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: USER_SELECT,
  });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  return user;
}

export async function createUser(input: CreateUserInput) {
  const username = input.username?.trim();
  const fullName = input.fullName?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password;

  if (!username) {
    throw new AppError("Username is required", 400);
  }

  if (!fullName) {
    throw new AppError("Full name is required", 400);
  }

  if (!email) {
    throw new AppError("Email is required", 400);
  }

  if (!password) {
    throw new AppError("Password is required", 400);
  }

  if (password.length < 6) {
    throw new AppError("Password must be at least 6 characters", 400);
  }

  if (!input.roleId) {
    throw new AppError("Role is required", 400);
  }

  const existingUsername = await prisma.user.findUnique({
    where: { username },
  });

  if (existingUsername) {
    throw new AppError("Username already exists", 409);
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingEmail) {
    throw new AppError("Email already exists", 409);
  }

  const role = await prisma.role.findUnique({
    where: {
      id: input.roleId,
    },
  });

  if (!role || !role.isActive) {
    throw new AppError("Invalid or inactive role", 400);
  }

  if (input.departmentId) {
    const department = await prisma.department.findUnique({
      where: {
        id: input.departmentId,
      },
    });

    if (!department || !department.isActive) {
      throw new AppError("Invalid or inactive department", 400);
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      username,
      fullName,
      email,
      passwordHash,
      roleId: input.roleId,
      departmentId: input.departmentId,
    },
    select: USER_SELECT,
  });

  return user;
}

export async function updateUser(id: number, input: UpdateUserInput) {
  if (!id) {
    throw new AppError("Invalid user ID", 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: { id },
  });

  if (!existingUser) {
    throw new AppError("User not found", 404);
  }

  const username = input.username?.trim();
  const email = input.email?.trim().toLowerCase();

  if (username) {
    const duplicateUsername = await prisma.user.findFirst({
      where: {
        username,
        id: {
          not: id,
        },
      },
    });

    if (duplicateUsername) {
      throw new AppError("Username already exists", 409);
    }
  }

  if (email) {
    const duplicateEmail = await prisma.user.findFirst({
      where: {
        email,
        id: {
          not: id,
        },
      },
    });

    if (duplicateEmail) {
      throw new AppError("Email already exists", 409);
    }
  }

  if (input.roleId) {
    const role = await prisma.role.findUnique({
      where: {
        id: typeof input.roleId === 'string' ? parseInt(input.roleId, 10) : input.roleId,
      },
    });

    if (!role || !role.isActive) {
      throw new AppError("Invalid or inactive role", 400);
    }
  }

  if (input.departmentId) {
    const department = await prisma.department.findUnique({
      where: {
        id: input.departmentId,
      },
    });

    if (!department || !department.isActive) {
      throw new AppError("Invalid or inactive department", 400);
    }
  }

  let passwordHash: string | undefined;

  if (input.password) {
    if (input.password.length < 6) {
      throw new AppError("Password must be at least 6 characters", 400);
    }

    passwordHash = await bcrypt.hash(input.password, 10);
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      username,
      fullName: input.fullname?.trim(),
      email,
      passwordHash,
      roleId: input.roleId ? parseInt(input.roleId) : undefined,
      departmentId: input.departmentId,
      isActive: input.isActive,
    },
    select: USER_SELECT,
  });

  return user;
}

export async function deleteUser(id: number) {
  if (!id) {
    throw new AppError("Invalid user ID", 400);
  }

  const existingUser = await prisma.user.findUnique({
    where: { id },
  });

  if (!existingUser) {
    throw new AppError("User not found", 404);
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      isActive: false,
    },
    select: USER_SELECT,
  });

  return user;
}