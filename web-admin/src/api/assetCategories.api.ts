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

function unwrapData<T>(response: any): T {
    return response?.data?.data ?? response?.data ?? response;
}

export async function getAssetCategoriesApi(): Promise<AssetCategory[]> {
    const response = await api.get('/asset-categories');
    return unwrapData<AssetCategory[]>(response);
}

export async function createAssetCategoryApi(payload: CreateAssetCategoryPayload) {
    const response = await api.post('/asset-categories', payload);
    return unwrapData<AssetCategory>(response);
}

