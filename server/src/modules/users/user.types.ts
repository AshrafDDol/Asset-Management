export type CreateUserInput = {
    username: string;
    fullName: string;
    email: string;
    password: string;
    roleId: number;
    departmentId?: number;
};

export type UpdateUserInput = {
    username?: string;
    fullName?: string;
    email?: string;
    password?: string;
    roleId?: string | number;
    departmentId?: number | null;
    isActive?: boolean;
};
