import { api } from './axios';
import type { Role } from './roles.api';

export type User = {
    id: number;
    username: string;
    email?: string;
    fullName?: string;
    roleId?: number | null;
    departmentId?: number | null;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    role?: Role | null;
    department?: { id: number; departmentCode: string; name: string } | null;
};

export type CreateUserPayload = {
    username: string;
    password: string;
    fullName: string;
    email?: string;
    roleId?: number;
    departmentId?: number | null;
};

export type UpdateUserPayload = {
    username?: string;
    password?: string;
    fullName?: string;
    email?: string;
    roleId?: number;
    departmentId?: number | null;
    isActive?: boolean;
};


function unwrapData<T>(response: unknown): T {
    const value = response as { data?: { data?: T } | T };
    if (value.data && typeof value.data === "object" && "data" in value.data) return value.data.data as T;
    return (value.data ?? response) as T;
}

export async function getUsersApi(): Promise<User[]> {
    const response = await api.get('/users');
    return unwrapData<User[]>(response);
}

export async function getUserByIdApi(id: number): Promise<User> {
    const response = await api.get(`/users/${id}`);
    return unwrapData<User>(response);
}

export async function createUserApi(payload: CreateUserPayload): Promise<User> {
    const response = await api.post('/users', payload);
    return unwrapData<User>(response);
}

export async function updateUserApi(
    id: number,
    payload: UpdateUserPayload,
): Promise<User> {
    const response = await api.patch(`/users/${id}`, payload);
    return unwrapData<User>(response);
}

export async function deactivateUserApi(id: number): Promise<User> {
    const response = await api.delete(`/users/${id}`);
    return unwrapData<User>(response);
}
