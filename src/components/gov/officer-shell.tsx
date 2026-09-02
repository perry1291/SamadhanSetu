import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Copy,
  LayoutDashboard,
  ListOrdered,
  Map,
  Menu,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { to: "/officer", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/officer/queue", label: "Priority Queue", icon: ListOrdered, exact: false },
  { to: "/officer/duplicates", label: "Duplicate Review", icon: Copy, exact: false },
  { to: "/officer/map", label: "GIS Hotspots", icon: Map, exact: false },
  { to: "/officer/analytics", label: "Analytics & SLA", icon: BarChart3, exact: false },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map(({ to, label, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm font-medium text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{
            className:
              "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-sidebar-primary",
          }}
          activeOptions={{ exact }}
        >
          <Icon className="size-4 shrink-0" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function OfficerShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <div className="border-b border-sidebar-border px-4 py-4">
          <p className="font-serif text-lg font-bold text-sidebar-foreground">SamadhanSetu</p>
          <p className="text-xs text-sidebar-foreground/70">Officer Workspace · Zone 3, Pune</p>
        </div>
        <NavList />
        <div className="mt-auto border-t border-sidebar-border p-4">
          <p className="text-sm font-semibold text-sidebar-foreground">Er. Rakesh Deshmukh</p>
          <p className="text-xs text-sidebar-foreground/70">Executive Engineer · Public Works</p>
          <Link
            to="/"
            className="mt-3 inline-flex items-center gap-2 text-xs text-sidebar-foreground/80 hover:text-sidebar-primary"
          >
            <LogOut className="size-3.5" /> Exit to citizen portal
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b bg-card">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar p-0">
                <div className="border-b border-sidebar-border px-4 py-5">
                  <p className="font-serif text-lg font-bold text-sidebar-foreground">SamadhanSetu</p>
                  <p className="text-xs text-sidebar-foreground/70">Officer Workspace</p>
                </div>
                <NavList />
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold sm:text-xl">{title}</h1>
              {subtitle ? (
                <p className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
              ) : null}
            </div>
            {actions}
          </div>
          <div className="gov-tricolour-rule h-[2px]" aria-hidden />
        </header>
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</div>
      </div>
    </div>
  );
}
