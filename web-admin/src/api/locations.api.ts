import { api } from "./axios";

export type Location = {
    id: number;
    locationCode: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
    createdAt?: string;
};

export type CreateLocationPayload = {
    locationCode: string;
    name: string;
    description?: string;
};

function unwrapData<T>(response: any): T {
    return response?.data?.data ?? response?.data ?? response;
}

export async function getLocationsApi(): Promise<Location[]> {
    const response = await api.get('/locations');
    return unwrapData<Location[]>(response);
}

export async function createLocationApi(payload: CreateLocationPayload) {
    const response = await api.post('/locations', payload);
    return unwrapData<Location>(response);
}