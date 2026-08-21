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

function unwrapData<T>(response: any): T {
    return response?.data?.data ?? response?.data ?? response;
}

export async function getDepartmentsApi(): Promise<Department[]>{
    const response = await api.get('/departments');
    return unwrapData<Department[]>(response);
}

export async function createDepartmentApi(payload: CreateDepartmentPayload) {
    const response = await api.post('/departments', payload);
    return unwrapData<Department>(response);
}