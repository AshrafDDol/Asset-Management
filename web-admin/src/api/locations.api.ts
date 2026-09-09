import { api } from "./axios";

export type Location = {
    id: number;
    locationCode: string;
    name: string;
    description?: string | null;
    parentLocationId?: number | null;
    departmentId?: number | null;
    locationType: string;
    displayPath?: string;
    parentLocation?: Pick<Location, "id" | "locationCode" | "name" | "locationType"> | null;
    department?: { id: number; departmentCode: string; name: string } | null;
    resolvedDepartment?: { id: number; departmentCode: string; name: string } | null;
    isActive?: boolean;
    createdAt?: string;
};

export type CreateLocationPayload = {
    locationCode: string;
    name: string;
    description?: string;
    parentLocationId?: number | null;
    departmentId?: number | null;
    locationType?: string;
};

function unwrapData<T>(response: unknown): T {
    const value = response as { data?: { data?: T } | T };
    if (value.data && typeof value.data === "object" && "data" in value.data) return value.data.data as T;
    return (value.data ?? response) as T;
}

export async function getLocationsApi(): Promise<Location[]> {
    const response = await api.get('/locations');
    return unwrapData<Location[]>(response);
}

export async function createLocationApi(payload: CreateLocationPayload) {
    const response = await api.post('/locations', payload);
    return unwrapData<Location>(response);
}

export async function updateLocationApi(id: number, payload: Partial<CreateLocationPayload> & { isActive?: boolean }) {
    const response = await api.put(`/locations/${id}`, payload);
    return unwrapData<Location>(response);
}

export async function deleteLocationApi(id: number) {
    const response = await api.delete(`/locations/${id}`);
    return unwrapData<Location>(response);
}
