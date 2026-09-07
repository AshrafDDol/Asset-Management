import { api } from './axios';
import type { AssetCategory } from './assetCategories.api';
import type { Location } from './locations.api';
import type { BladeSku } from './bladeSkus.api';

export type Asset = {
    id: number;
    assetCode: string;
    itemName: string;
    categoryId: number;
    bladeSkuId?: number | null;
    locationId?: number | null;
    homeLocationId?: number | null;
    homeLocation?: Location | null;
    serialNumber?: string | null;
    brand?: string;
    model?: string;
    measurementHeight?: string | number | null;
    measurementWidth?: string | number | null;
    purchaseDate?: string | null;
    purchaseCost?: number | null;
    status?: string;
    condition?: string;
    remarks?: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;

    category?: AssetCategory;
    location?: Location;
    bladeSku?: BladeSku | null;
    epc?: { id: number; epcCode: string; status: string; isActive: boolean } | null;
    locationPath?: string | null;
};

export type CreateAssetPayload = {
    assetCode: string;
    itemName?: string;
    categoryId: number;
    bladeSkuId?: number;
    epcCode?: string;
    autoGenerateEpc?: boolean;
    locationId: number;
    serialNumber?: string;
    brand?: string;
    model?: string;
    purchaseDate?: string;
    purchaseCost?: number;
    condition?: string;
    measurementHeight?: number | null;
    measurementWidth?: number | null;
    remarks?: string;
};

export type UpdateAssetPayload = Partial<Omit<CreateAssetPayload, "epcCode">> & {
    homeLocationId?: number;
    isActive?: boolean;
};

function unwrapData<T>(response: unknown): T {
    const value = response as { data?: { data?: T } | T };
    if (value.data && typeof value.data === "object" && "data" in value.data) return value.data.data as T;
    return (value.data ?? response) as T;
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
