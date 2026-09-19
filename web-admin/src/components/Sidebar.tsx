import {
  Boxes,
  Building2,
  ClipboardList,
  LayoutDashboard,
  MapPin,
  MoveRight,
  Package,
  ShieldCheck,
  UserRound,
  Warehouse,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

export const menuGroups = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" }],
  },
  {
    label: "Master Data",
    items: [
      { label: "Locations", icon: MapPin, path: "/locations" },
      { label: "Departments", icon: Building2, path: "/departments" },
      { label: "Asset Categories", icon: Boxes, path: "/asset-categories" },
      { label: "Assets", icon: Package, path: "/assets" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Asset Issue", icon: ClipboardList, path: "/issue-batches" },
      { label: "Stock Takes", icon: ClipboardList, path: "/stock-takes" },
      { label: "Asset Movement History", icon: MoveRight, path: "/asset-movements" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", icon: UserRound, path: "/users" },
      { label: "Roles", icon: ShieldCheck, path: "/roles" },
    ],
  },
];

/** Flattened lookup so the header can name the active page. */
export const menuItems = menuGroups.flatMap((group) => group.items);

export function AppSidebar() {
  const { pathname } = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Warehouse className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Evolve Inventory</span>
                  <span className="truncate text-xs text-muted-foreground">Inventory Admin</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname.startsWith(item.path)}
                        tooltip={item.label}
                      >
                        <NavLink to={item.path}>
                          <Icon />
                          <span>{item.label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
