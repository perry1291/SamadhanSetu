import { Link } from "@tanstack/react-router";
import { LogOut, Menu, Phone, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { LanguageSelector } from "@/components/gov/language-selector";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/i18n/use-translation";
import type { TranslationKey } from "@/i18n/translations";
import { CitizenSessionBar } from "@/components/gov/citizen-session-bar";
import type { AuthenticatedUser } from "@/lib/auth-api";
import { useLogout } from "@/lib/use-logout";
import { useOptionalUser } from "@/lib/use-optional-user";

/**
 * Nav labels are translation keys, not literals, so switching language updates
 * the navigation along with page content.
 *
 * `exact` marks a link whose path is a prefix of a sibling's, so the parent does
 * not stay highlighted while a child route is open.
 */
interface NavItem {
  readonly to: string;
  readonly labelKey: TranslationKey;
  readonly exact?: boolean;
}

/** Visitors get the two ways in and nothing that would 404 behind a login wall. */
const ANONYMOUS_NAV: readonly NavItem[] = [
  { to: "/register", labelKey: "nav.register" },
  { to: "/login", labelKey: "nav.login" },
  // Retargeted from the bare `/officer`, which is not a route. `origin/main`
  // dropped that entry for the same reason and added `routes/officer.login.tsx`,
  // so the affordance is kept and now points somewhere that exists.
  { to: "/officer/login", labelKey: "nav.officerLogin" },
];

const CITIZEN_NAV: readonly NavItem[] = [
  { to: "/complaint", labelKey: "nav.complaint" },
  { to: "/my-complaints", labelKey: "nav.myComplaints" },
];

/** Officers, supervisors and admins work out of the departmental workspace. */
const STAFF_NAV: readonly NavItem[] = [
  { to: "/officer", labelKey: "nav.dashboard", exact: true },
  { to: "/officer/queue", labelKey: "nav.allComplaints" },
];

/**
 * The navigation is derived from the server-resolved role, so it changes on login
 * and logout without any client-side auth state to keep in sync. This only
 * decides what is *shown*; every protected server function guards itself.
 */
function navFor(user: AuthenticatedUser | null): readonly NavItem[] {
  if (user === null) return ANONYMOUS_NAV;
  return user.role === "CITIZEN" ? CITIZEN_NAV : STAFF_NAV;
}

export function Emblem({ className }: { className?: string }) {
  return (
    <div
      className={
        "flex size-11 shrink-0 items-center justify-center rounded-sm border border-primary-foreground/25 bg-primary-foreground/10 " +
        (className ?? "")
      }
      aria-hidden
    >
      <span className="font-serif text-lg font-bold leading-none">सत्य</span>
    </div>
  );
}

/**
 * Logout control. Lives in the navigation next to the signed-in destinations so
 * there is exactly one place to leave the session from.
 */
function LogoutButton({ className, onDone }: { className?: string; onDone?: () => void }) {
  const { t } = useTranslation();
  const { logout, busy } = useLogout();

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        void logout().then(onDone);
      }}
      className={
        "flex items-center gap-2 rounded-sm text-sm font-medium transition-colors " +
        "focus-visible:ring-2 focus-visible:ring-saffron focus-visible:outline-none " +
        "disabled:opacity-60 " +
        (className ?? "")
      }
    >
      <LogOut className="size-4 shrink-0" aria-hidden />
      {busy ? t("login.loggingOut") : t("login.logout")}
    </button>
  );
}

export function CitizenShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const user = useOptionalUser();
  const nav = navFor(user);
  const signedIn = user !== null;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="gov-banner text-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-1.5">
          <p className="opacity-90">{t("shell.govOfIndia")}</p>
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Signed-in identity only; logout lives in the navigation. */}
            <CitizenSessionBar />
            {/* Language selector sits top-right of the government header. */}
            <LanguageSelector className="opacity-90" />
          </div>
        </div>
      </div>

      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Emblem />
          <div className="min-w-0 flex-1">
            <Link to="/" className="block">
              <h2 className="font-serif text-xl leading-tight font-bold sm:text-2xl">
                {t("shell.platformName")}
              </h2>
              <p className="truncate text-xs opacity-85">{t("shell.platformTagline")}</p>
            </Link>
          </div>
          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-sm px-3 py-2 text-sm font-medium transition-colors hover:bg-primary-foreground/12"
                activeProps={{ className: "bg-primary-foreground/18" }}
                activeOptions={{ exact: item.exact === true }}
              >
                {t(item.labelKey)}
              </Link>
            ))}
            {/* Admin entry point from `origin/main`, kept alongside the
                session-aware controls rather than replacing them. */}
            <Link
              to="/admin/login"
              className="rounded-sm px-3 py-2 text-sm font-medium text-emerald-300 transition-colors hover:bg-primary-foreground/12"
            >
              {t("nav.adminPortal")}
            </Link>
            {signedIn ? (
              <LogoutButton className="ml-1 border border-primary-foreground/30 px-3 py-2 hover:bg-primary-foreground/12" />
            ) : null}
          </nav>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <div className="mt-8 flex flex-col gap-1 px-4">
                {nav.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="rounded-sm px-3 py-2.5 text-sm font-medium hover:bg-accent"
                    activeProps={{ className: "bg-accent text-accent-foreground" }}
                    activeOptions={{ exact: item.exact === true }}
                  >
                    {t(item.labelKey)}
                  </Link>
                ))}
                <Separator className="my-2" />
                {/* Admin entry point from `origin/main`. Uses the shared
                    `Separator` rather than a bare bordered div, matching the rest
                    of this sheet. */}
                <Link
                  to="/admin/login"
                  className="rounded-sm px-3 py-2.5 text-sm font-medium text-emerald-600 hover:bg-accent"
                >
                  {t("nav.adminPortal")}
                </Link>
                {signedIn ? (
                  <>
                    <Separator className="my-2" />
                    <LogoutButton className="px-3 py-2.5 hover:bg-accent" />
                  </>
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="gov-tricolour-rule h-[3px]" aria-hidden />
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t bg-primary-dark text-primary-foreground">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="font-serif text-lg font-bold">SamadhanSetu</h3>
            <p className="mt-2 text-sm opacity-80">
              A single window for citizens to lodge, track and escalate public service grievances
              with time-bound departmental accountability.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide opacity-90">
              Citizen Services
            </h4>
            <ul className="mt-3 space-y-2 text-sm opacity-85">
              <li>
                <Link to="/complaint">File a complaint</Link>
              </li>
              <li>
                <Link to="/my-complaints">My complaints & status</Link>
              </li>
              <li>
                <Link to="/register">Create a citizen account</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide opacity-90">
              Transparency
            </h4>
            <ul className="mt-3 space-y-2 text-sm opacity-85">
              <li>
                <Link to="/officer/analytics">Public performance dashboard</Link>
              </li>
              <li>
                <Link to="/officer/map">Grievance hotspot map</Link>
              </li>
              <li>Citizen Charter & SLA norms</li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wide opacity-90">Assistance</h4>
            <ul className="mt-3 space-y-2 text-sm opacity-85">
              <li className="flex items-center gap-2">
                <Phone className="size-4" /> Toll free 1800-11-4455
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck className="size-4" /> Grievance data is confidential
              </li>
              <li>Available in 8 languages</li>
            </ul>
          </div>
        </div>
        <Separator className="opacity-20" />
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs opacity-75">
          <p>
            Demonstration prototype for SIH26-S02. Content and grievance data shown are illustrative
            and do not represent live government records.
          </p>
        </div>
      </footer>
    </div>
  );
}
