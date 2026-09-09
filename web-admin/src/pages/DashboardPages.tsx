import { useAuthStore } from "../stores/authStores";

export function DashboardPage() {
    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);

    return (
        <div className="dashboard-page">
            <div className="topbar">
                <div>
                    <h1>Dashboard</h1>
                    <p>Welcome, {user?.fullName || user?.username || "Admin"}</p>
                </div>

                <button onClick={logout}>Logout</button>
            </div>

            <div className="dashboard-grid">
                <div className="dashboard-card">
                    <h2>Locations</h2>
                    <p>Manage asset locations</p>
                </div>

                <div className="dashboard-card">
                    <h2>Departments</h2>
                    <p>Manage company departments</p>
                </div>

                <div className="dashboard-card">
                    <h2>Assets Movement</h2>
                    <p>Manage company assets movements</p>
                </div>

            </div>
        </div>
    );
}
