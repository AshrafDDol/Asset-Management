import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../stores/authStores";

export function ProtectedRoute() {
    const isAuthenticated = useAuthStore ((state) => state.isAuthenticated);

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }
    return <Outlet />;
}