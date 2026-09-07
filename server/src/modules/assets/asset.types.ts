export type CreateAssetInput = {
    assetCode: string;
    itemName?: string;
    categoryId: number;
    bladeSkuId?: number;
    locationId: number;
    epc?: string;
    epcCode?: string;
    autoGenerateEpc?: boolean;
    serialNumber?: string;
    brand?: string;
    model?: string;
    purchaseDate?: string;
    purchaseCost?: number;
    condition?: string;
    measurementHeight?: number | string | null;
    measurementWidth?: number | string | null;
    remarks?: string;
};

export type UpdateAssetInput = Partial<Omit<CreateAssetInput, "epc" | "epcCode" | "autoGenerateEpc">> & {
    homeLocationId?: number;
    isActive?: boolean;
};

export type AssetFilters = {
    bladeSkuId?: number;
    status?: string;
    locationId?: number;
    assetCode?: string;
};
