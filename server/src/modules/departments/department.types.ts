export type CreateDepartmentInput = {
    departmentCode: string;
    name: string;
    description?: string;
};

export type UpdateDepartmentInput = {
    departmentCode?: string;
    name?: string;
    description?: string;
    isActive?: boolean;
};