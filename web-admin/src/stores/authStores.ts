import { create } from 'zustand';
import { LoginApi } from '../api/auth.api';

type User = {
    id: number;
    username: string;
    fullName?: string;
    role?: string;
};

type AuthState = {
    token: string | null;
    user: User | null;
    isAuthenticated: boolean;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
};

function extractToken(response: any): string | null  {
    return (
        response?.token ||
        response?.accessToken ||
        response?.data?.token ||
        response?.data?.accessToken ||
        null
    );
}

function extractUser(response: any): User | null {
    return response?.user || response?.data?.user || null;
}

export const useAuthStore = create<AuthState> ((set) => ({
    token: localStorage.getItem("token"),
    user: JSON.parse(localStorage.getItem("user") || "null"),
    isAuthenticated: Boolean(localStorage.getItem("token")),

    login: async (usernameOrEmail, password) => {
        const response = await LoginApi({ usernameOrEmail, password });

        const token = extractToken(response);
        const user = extractUser(response);

        if (!token) {
            throw new Error ("Login Success, but no token in API response");
        }

        localStorage.setItem("token", token);

        if (user) {
            localStorage.setItem("user", JSON.stringify(user));
        }

        set({
            token,
            user,
            isAuthenticated: true,
        });
    },

    logout: () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        set({
            token: null,
            user: null,
            isAuthenticated: false,
        });
    }
}));
