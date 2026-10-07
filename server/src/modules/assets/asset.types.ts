export type CreateAssetInput = {
    assetCode: string;
    itemName?: string;
    categoryId: number;
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
    gridUp?: number | string | null;
    radius?: number | string | null;
    gapMm?: number | string | null;
    remarks?: string;
};

export type UpdateAssetInput = Partial<Omit<CreateAssetInput, "epc" | "epcCode" | "autoGenerateEpc">> & {
    homeLocationId?: number;
    isActive?: boolean;
};

export type AssetFilters = {
    status?: string;
    locationId?: number;
    assetCode?: string;
    itemName?: string;
    categoryId?: number;
    homeLocationId?: number;
    epc?: string;
    condition?: string;
    measurementHeight?: number;
    measurementWidth?: number;
    gridUp?: number;
    radius?: number;
    gapMm?: number;
};

export type AssetImportRowInput = {
    sourceRow: number;
    assetCode?: string;
    itemName?: string;
    categoryCode?: string;
    storageLocationCode?: string;
    measurementHeight?: string | number | null;
    measurementWidth?: string | number | null;
    gridUp?: string | number | null;
    radius?: string | number | null;
    gapMm?: string | number | null;
    serialNumber?: string;
    brand?: string;
    model?: string;
    purchaseDate?: string;
    purchaseCost?: string | number | null;
    condition?: string;
    epc?: string;
    autoGenerateEpc?: boolean | string;
    remarks?: string;
};
