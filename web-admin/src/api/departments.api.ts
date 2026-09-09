import { api } from './axios';

export type Department = {
    id: number;
    departmentCode: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
    createdAt?: string;
};

export type CreateDepartmentPayload = {
    departmentCode: string;
    name: string;
    description?: string;
};

export type UpdateDepartmentPayload = Partial<CreateDepartmentPayload> & { isActive?: boolean };

function unwrapData<T>(response: unknown): T {
    const value = response as { data?: { data?: T } | T };
    if (value.data && typeof value.data === "object" && "data" in value.data) return value.data.data as T;
    return (value.data ?? response) as T;
}

export async function getDepartmentsApi(): Promise<Department[]>{
    const response = await api.get('/departments');
    return unwrapData<Department[]>(response);
}

export async function createDepartmentApi(payload: CreateDepartmentPayload) {
    const response = await api.post('/departments', payload);
    return unwrapData<Department>(response);
}

export async function updateDepartmentApi(id: number, payload: UpdateDepartmentPayload) {
    const response = await api.put(`/departments/${id}`, payload);
    return unwrapData<Department>(response);
}

export async function deleteDepartmentApi(id: number) {
    const response = await api.delete(`/departments/${id}`);
    return unwrapData<Department>(response);
}
