export type LoginInput = {
  usernameOrEmail: string;
  password: string;
};

export type JwtUserPayload = {
  userId: number;
  username: string;
  roleId: number;
  roleName: string;
};