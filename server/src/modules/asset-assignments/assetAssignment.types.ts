export type CreateAssetAssignmentInput = {
    assetId: number;
    assignedToUserId: number;
    departmentId?: number;
    locationId?: number;
    assignedDate?: string;
    returnDueDate?: string;
    purpose?: string;
    remarks?: string;
};

export type UpdateAssetAssignmentInput = {
    assignedToUserId?: number;
    departmentId?: number | null;
    locationId?: number | null;
    assignedDate?: string;
    returnDueDate?: string | null;
    purpose?: string;
    remarks?: string;
};
