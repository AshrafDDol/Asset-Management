import bcrypt from "bcrypt";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { LoginInput } from "./auth.types";

const USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  roleId: true,
  departmentId: true,
  isActive: true,
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

export async function loginUser(input: LoginInput) {
  const usernameOrEmail = input.usernameOrEmail?.trim().toLowerCase();
  const password = input.password;

  if (!usernameOrEmail) {
    throw new AppError("Username or email is required", 400);
  }

  if (!password) {
    throw new AppError("Password is required", 400);
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        {
          username: usernameOrEmail,
        },
        {
          email: usernameOrEmail,
        },
      ],
    },
    include: {
      role: true,
      department: true,
    },
  });

  if (!user) {
    throw new AppError("Invalid username/email or password", 401);
  }

  if (!user.isActive) {
    throw new AppError("User account is inactive", 403);
  }

  if (!user.role.isActive) {
    throw new AppError("User role is inactive", 403);
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError("Invalid username/email or password", 401);
  }

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new AppError("JWT secret is not configured", 500);
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      roleId: user.roleId,
      roleName: user.role.name,
    },
    jwtSecret as Secret,
    {
      expiresIn,
    } as SignOptions
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      roleId: user.roleId,
      role: {
        id: user.role.id,
        name: user.role.name,
      },
      departmentId: user.departmentId,
      department: user.department
        ? {
            id: user.department.id,
            departmentCode: user.department.departmentCode,
            name: user.department.name,
          }
        : null,
    },
  };
}

export async function getCurrentUser(userId: number) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: USER_SELECT,
  });

  if (!user || !user.isActive) {
    throw new AppError("User not found or inactive", 401);
  }

  return user;
}