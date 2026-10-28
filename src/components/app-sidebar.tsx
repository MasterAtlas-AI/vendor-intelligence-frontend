"use client";

import {
  Building2,
  ChevronsUpDown,
  Compass,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  ScrollText,
  ShieldCheck,
  Settings2,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api/client";
import { P } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  needsTenant?: boolean;
}

const WORKSPACE: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Background jobs", icon: ListChecks },
];

const SETTINGS: NavItem[] = [
  { href: "/settings/profile", label: "My profile", icon: UserRound },
  { href: "/settings/organization", label: "Organization", icon: Settings2, permission: P.TENANT_SETTINGS_MANAGE, needsTenant: true },
  { href: "/settings/users", label: "Users & roles", icon: Users, permission: P.USER_READ, needsTenant: true },
  { href: "/settings/api-keys", label: "API keys", icon: KeyRound, permission: P.APIKEY_MANAGE, needsTenant: true },
  { href: "/settings/audit-log", label: "Audit log", icon: ScrollText, permission: P.AUDIT_READ, needsTenant: true },
];

const PLATFORM: NavItem[] = [
  { href: "/admin/tenants", label: "Tenants", icon: Building2, permission: P.TENANT_MANAGE },
  { href: "/admin/audit-logs", label: "Platform audit log", icon: ShieldCheck, permission: P.TENANT_MANAGE },
];

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const pathname = usePathname();
  const user = useAuth((s) => s.user);
  const actAs = useAuth((s) => s.actAs);
  const hasTenant = Boolean(user?.tenant || actAs);
  const visible = items.filter(
    (i) => (!i.permission || user?.permissions.includes(i.permission)) && (!i.needsTenant || hasTenant),
  );
  if (!visible.length) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {visible.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
                tooltip={item.label}
                render={<Link href={item.href} />}
              >
                <item.icon />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function UserMenu() {
  const router = useRouter();
  const { user, clearSession } = useAuth();
  if (!user) return null;

  async function signOut(everywhere: boolean) {
    try {
      await api(everywhere ? "/auth/logout-all" : "/auth/logout", { method: "POST" });
    } catch {
      // Signing out locally is what matters; the refresh token expires on its own.
    }
    clearSession();
    if (everywhere) toast.success("Signed out on all devices");
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
        <Avatar className="size-8 rounded-lg">
          <AvatarFallback className="rounded-lg">{initials(user.full_name)}</AvatarFallback>
        </Avatar>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-medium">{user.full_name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </div>
        <ChevronsUpDown className="ml-auto size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {user.tenant?.name ?? "Platform staff"} · {[...user.platform_roles, ...user.roles].join(", ") || "no role"}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings/profile")}>
          <UserRound /> My profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => signOut(false)}>
          <LogOut /> Sign out
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => signOut(true)}>
          <LogOut /> Sign out everywhere
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Compass className="size-5" />
              </span>
              <div className="grid flex-1 text-left leading-tight">
                <span className="font-semibold">MasterAtlas AI</span>
                <span className="text-xs text-muted-foreground">Vendor intelligence</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label="Workspace" items={WORKSPACE} />
        <NavGroup label="Settings" items={SETTINGS} />
        <NavGroup label="Platform" items={PLATFORM} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
