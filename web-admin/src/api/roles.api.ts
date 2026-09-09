import { api } from './axios';

export type Role = {
    id: number;
    name: string;
    description?: string | null;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
};

export type CreateRolePayload = {
    name?: string;
    description?: string;
};

export type UpdateRolePayload = {
    name?: string;
    description?: string;
    isActive?: boolean;
};

function unwrapData<T>(response: unknown): T {
    const value = response as { data?: { data?: T } | T };
    if (value.data && typeof value.data === "object" && "data" in value.data) return value.data.data as T;
    return (value.data ?? response) as T;
}

export async function getRolesApi(): Promise<Role[]> {
    const response = await api.get('/roles');
    return unwrapData<Role[]>(response);
}

export async function createRoleApi(payload: CreateRolePayload): Promise<Role> {
    const response = await api.post('/roles', payload);
    return unwrapData<Role>(response);
}

export async function updateRoleApi(
    id: number,
    payload: UpdateRolePayload,
): Promise<Role> {
    const response = await api.put(`/roles/${id}`, payload);
    return unwrapData<Role>(response);
}

export async function deleteRoleApi(id: number): Promise<Role> {
    const response = await api.delete(`/roles/${id}`);
    return unwrapData<Role>(response);
}
