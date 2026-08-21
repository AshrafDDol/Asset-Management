import { api } from "./axios";

export type LoginPayload = {
    usernameOrEmail: string;
    password: string;
};

export async function LoginApi(payload: LoginPayload) {
    const response = await api.post("/auth/login", payload);
    return response.data;
}