import { api } from './axios';

export type AssetCategory = {
    id: number;
    categoryCode: string;
    name: string;
    description?: string | null;
    isActive?: boolean;
    createdAt?: string;
};

export type CreateAssetCategoryPayload = {
    categoryCode: string;
    name: string;
    description?: string | null;
};

export type UpdateAssetCategoryPayload = Partial<CreateAssetCategoryPayload> & { isActive?: boolean };

function unwrapData<T>(response: unknown): T {
    const value = response as { data?: { data?: T } | T };
    if (value.data && typeof value.data === "object" && "data" in value.data) return value.data.data as T;
    return (value.data ?? response) as T;
}

export async function getAssetCategoriesApi(): Promise<AssetCategory[]> {
    const response = await api.get('/asset-categories');
    return unwrapData<AssetCategory[]>(response);
}

export async function createAssetCategoryApi(payload: CreateAssetCategoryPayload) {
    const response = await api.post('/asset-categories', payload);
    return unwrapData<AssetCategory>(response);
}

export async function updateAssetCategoryApi(id: number, payload: UpdateAssetCategoryPayload) {
    const response = await api.put(`/asset-categories/${id}`, payload);
    return unwrapData<AssetCategory>(response);
}

export async function deleteAssetCategoryApi(id: number) {
    const response = await api.delete(`/asset-categories/${id}`);
    return unwrapData<AssetCategory>(response);
}

