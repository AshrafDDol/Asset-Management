export type CreateLocationInput = {
    locationCode: string;
    name: string;
    description?: string;
};

export type UpdateLocationInput = {
    locationCode?: string;
    name?: string;
    description?: string;
    isActive?: boolean;
};