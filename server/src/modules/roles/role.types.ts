export type CreateRoleInput = {
    name: string;
    description?: string;
};

export type UpdateRoleInput = {
    name?: string;
    description?: string;
    isActive?: boolean;
};