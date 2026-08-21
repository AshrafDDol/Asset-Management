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
    fullname?: string;
    email?: string;
    password?: string;
    roleId?: string;
    departmentId?: number | null;
    isActive?: boolean;
};