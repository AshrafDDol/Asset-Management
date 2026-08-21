export type CreateAssetMovementInput = {
    assetId: number | string;
    toDepartmentId?: number | string | null;
    toLocationId?: number | string | null;
    movementDate?: string;
    reason?: string;
    remarks?: string;
};