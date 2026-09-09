import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAuthStore } from "../stores/authStores";

export function Layout() {
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);

    return (
        <div className="app-layout">
            <Sidebar />
            <main className="main-content">
                <header className="main-header">
                    <div>
                        <h1>Evolve Inventory Management</h1>
                        <p>Asset Tracking and Issue Management System</p>
                    </div>

                    <div className="header-user">
                        <span>{user?.fullName || user?.username || "Admin"}</span>
                        <button onClick={logout}>Logout</button>
                    </div>
                </header>

                <section className="page-content">
                    <Outlet />
                </section>
            </main>
        </div>
    );
}
