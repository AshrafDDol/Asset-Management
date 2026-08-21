export type CreateAssetEpcInput = {
    epcCode: string;
    assetId: number;
    status?: string;
    remarks?: string;
};

export type UpdateAssetEpcInput = {
    epcCode?: string;
    assetId?: number;
    status?: string;
    remarks?: string;
    isActive?: boolean;
};