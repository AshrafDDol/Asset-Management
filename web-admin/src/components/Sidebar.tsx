import {
    Boxes,
    Building2,
    LayoutDashboard,
    MapPin,
    MoveRight,
    ShieldCheck,
    Package,
    UserRound,
    Wrench,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const menuItems =[
    {label: "Dashboard", icon: LayoutDashboard, path: "/dashboard"},
    {label: "Locations", icon: MapPin, path: "/locations"},
    {label: "Departments", icon: Building2, path: "/departments"},
    {label: "Assets", icon: Package, path: "/assets"},
    {label: "Asset Categories", icon: Boxes, path: "/asset-categories"},
    {label: "Asset Movements", icon: MoveRight, path: "/asset-movements"},
    {label: "Users", icon: UserRound, path: "/users"},
    {label: "Repairs", icon: Wrench, path: "/repairs"},
    {label: "Roles", icon: ShieldCheck, path: "/roles"},
];

export function Sidebar() {
    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <h2>Evolve Inventory Management</h2>
                <span>Inventory Admin</span>
            </div>
            
            <nav className="sidebar-nav">
                {menuItems.map((item) => {
                    const Icon = item.icon;

                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                isActive ? "sidebar-link active" : "sidebar-link"
                        }
                        >
                            <Icon size={18}/>   
                            <span>{item.label}</span>
                        </NavLink>
                    );
                })}
            </nav>
        </aside>
    );
}