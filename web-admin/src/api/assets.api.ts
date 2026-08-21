import { api } from './axios';
import type { AssetCategory } from './assetCategories.api';
import type { Department } from './departments.api';
import type { Location } from './locations.api';

export type Asset = {
    id: number;
    assetCode: string;
    itemName: string;
    categoryId: number;
    departmentId?: number | null;
    locationId?: number | null;
    serialNumber?: string | null;
    brand?: string;
    model?: string;
    purchaseDate?: string | null;
    purchaseCost?: number | null;
    status?: string;
    condition?: string;
    remarks?: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;

    category?: AssetCategory;
    department?: Department;
    location?: Location;
};

export type CreateAssetPayload = {
    assetCode: string;
    itemName: string;
    categoryId: number;
    departmentId?: number;
    locationId?: number;
    serialNumber?: string;
    brand?: string;
    model?: string;
    purchaseDate?: string;
    purchaseCost?: number;
    status?: string;
    condition?: string;
    remarks?: string;
};

export type UpdateAssetPayload = Partial<CreateAssetPayload> & {
    isActive?: boolean;
};

function unwrapData<T>(response: any): T {
    return response?.data?.data ?? response?.data ?? response;
}

export async function getAssetsApi(): Promise<Asset[]> {
    const response = await api.get('/assets');
    return unwrapData<Asset[]>(response);
}

export async function getAssetByIdApi(id: number): Promise<Asset> {
    const response = await api.get(`/assets/${id}`);
    return unwrapData<Asset>(response);
}

export async function createAssetApi(payload: CreateAssetPayload) {
    const response = await api.post('/assets', payload);
    return unwrapData<Asset>(response);
}

export async function updateAssetApi(
    id: number,
    payload: UpdateAssetPayload
): Promise<Asset> {
    const response = await api.patch(`/assets/${id}`, payload);
    return unwrapData<Asset>(response);
}