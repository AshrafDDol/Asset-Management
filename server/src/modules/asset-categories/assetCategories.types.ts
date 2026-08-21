export type CreateAssetCategoryInput = {
    categoryCode: string;
    name: string;
    description?: string;
};

export type UpdateAssetCategoryInput = {
    categoryCode?: string;
    name?: string;
    description?: string;
    isActive?: boolean;
};