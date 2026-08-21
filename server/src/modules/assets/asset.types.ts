export type CreateAssetInput = {
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

export type UpdateAssetInput = Partial<CreateAssetInput> & {
    isActive?: boolean;
};