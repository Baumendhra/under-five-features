import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { notificationsQueryOptions, markNotificationRead } from "@/lib/edutrace.functions";
import { userProfileQueryOptions } from "@/lib/edutrace.functions";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import type { Role } from "@/hooks/use-user-profile";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});

// Navigation items per role per the RBAC specification.
// "all" means every authenticated role.
type NavItem = { to: string; label: string; roles: Role[] | "all" };

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", roles: "all" },
  { to: "/students", label: "Students", roles: ["aicte_admin", "institution_admin", "officer"] },
  { to: "/profile", label: "My Profile", roles: ["student"] },
  { to: "/import", label: "Import", roles: ["aicte_admin", "institution_admin", "officer"] },
  { to: "/institutions", label: "Institutions", roles: ["aicte_admin"] },
  { to: "/programmes", label: "Programmes", roles: ["aicte_admin", "institution_admin"] },
  {
    to: "/duplicates",
    label: "Duplicates",
    roles: ["aicte_admin", "institution_admin", "officer"],
  },
  {
    to: "/corrections",
    label: "Corrections",
    roles: ["aicte_admin", "institution_admin", "officer"],
  },
  { to: "/audit", label: "Audit", roles: ["aicte_admin", "institution_admin", "officer"] },
  { to: "/demo/dashboard", label: "🧪 Demo", roles: "all" },
];

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: notifications = [] } = useQuery(notificationsQueryOptions);
  const markRead = useServerFn(markNotificationRead);
  const queryClient = useQueryClient();

  const unread = notifications.filter((n) => !n.read).length;

  async function handleRead(id: string) {
    await markRead({ data: { notificationId: id } });
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div className="relative">
      <button
        id="notifications-bell"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        🔔
        {unread > 0 && (
          <Badge className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px]">
            {unread > 9 ? "9+" : unread}
          </Badge>
        )}
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-80 rounded-xl border border-border bg-card shadow-lg">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Notifications</p>
            </div>
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                No notifications yet.
              </p>
            ) : (
              <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 text-sm",
                      !n.read && "bg-primary/5",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={cn("font-medium text-foreground", !n.read && "font-semibold")}>
                        {n.title}
                      </p>
                      {n.message && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    {!n.read && (
                      <button
                        onClick={() => void handleRead(n.id)}
                        className="shrink-0 text-[10px] text-primary hover:underline"
                      >
                        Mark read
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const queryClient = useQueryClient();
  const { data: profile } = useQuery(userProfileQueryOptions);

  const role: Role = (profile?.role ?? "officer") as Role;
  const visibleNav = NAV_ITEMS.filter((item) => item.roles === "all" || item.roles.includes(role));

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  const roleBadgeColor: Record<string, string> = {
    aicte_admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    institution_admin: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    officer: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    student: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-8">
            <Link to="/dashboard" className="font-display text-2xl tracking-tight text-foreground">
              EduTrace
            </Link>
            <nav className="flex items-center gap-1">
              {visibleNav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    routerState.location.pathname.startsWith(item.to)
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Role badge */}
            {profile?.role && (
              <span
                className={cn(
                  "hidden rounded-full px-2 py-0.5 text-[11px] font-medium capitalize sm:inline",
                  roleBadgeColor[profile.role] ?? "bg-muted text-muted-foreground",
                )}
              >
                {profile.role.replace("_", " ")}
              </span>
            )}

            <NotificationBell />

            <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Session expiry / unauthorized notice appears here via error boundary in __root.tsx */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
