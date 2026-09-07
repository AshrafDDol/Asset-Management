export type LocationFilters = {
    parentId?: number | null;
    locationType?: string;
};

export type CreateLocationInput = {
    locationCode: string;
    name: string;
    description?: string;
    parentLocationId?: number | null;
    departmentId?: number | null;
    locationType?: string;
};

export type UpdateLocationInput = {
    locationCode?: string;
    name?: string;
    description?: string;
    parentLocationId?: number | null;
    departmentId?: number | null;
    locationType?: string;
    isActive?: boolean;
};
