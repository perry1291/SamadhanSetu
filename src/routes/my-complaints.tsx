/**
 * My Complaints — the signed-in citizen's own complaint history.
 *
 * The list is loaded by the route loader, which runs server-side during SSR, so
 * the HttpOnly session cookie is readable and no request carries a citizen id.
 * The server function resolves ownership from the session; the sign-in check
 * below is UX only.
 *
 * Nothing is invented for a complaint that is still awaiting routing: the
 * department, category, priority and SLA cells stay empty and the row says why,
 * rather than showing a plausible-looking placeholder.
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, FilePlus2, Info, Inbox, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { CitizenShell } from "@/components/gov/citizen-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/i18n/use-translation";
import type { TranslationKey } from "@/i18n/translations";
import { listMyComplaintsFn, type MyComplaintSummary } from "@/lib/complaint-api";
import { departmentName } from "@/lib/departments";
import { findState } from "@/lib/locations";
import { useOptionalUser } from "@/lib/use-optional-user";
import { cn } from "@/lib/utils";
import type { GrievanceStatus, Priority } from "@/lib/validation/complaint";

export const Route = createFileRoute("/my-complaints")({
  head: () => ({
    meta: [
      { title: "My Complaints — SamadhanSetu" },
      {
        name: "description",
        content:
          "View every complaint you have filed on SamadhanSetu, with its current status, routed department and expected action date.",
      },
      // Personal data; keep it out of search indexes.
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: async () => listMyComplaintsFn(),
  component: MyComplaintsPage,
});

const BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-semibold " +
  "uppercase tracking-wide whitespace-nowrap";

/** Keyed by the stored enum, not a display string, so a new status cannot slip through untyped. */
const STATUS_STYLES: Record<GrievanceStatus, string> = {
  SUBMITTED: "bg-secondary text-secondary-foreground border-border",
  UNDER_REVIEW: "bg-info/10 text-info border-info/30",
  ASSIGNED: "bg-primary/10 text-primary border-primary/30",
  IN_PROGRESS: "bg-warning/15 text-warning-foreground border-warning/40",
  RESOLVED: "bg-success/12 text-success border-success/30",
  CLOSED: "bg-muted text-muted-foreground border-border",
};

const PRIORITY_STYLES: Record<Priority, string> = {
  CRITICAL: "bg-destructive/12 text-destructive border-destructive/40",
  HIGH: "bg-destructive/10 text-destructive border-destructive/30",
  MEDIUM: "bg-saffron/15 text-saffron-foreground border-saffron/40",
  LOW: "bg-secondary text-secondary-foreground border-border",
};

function MyComplaintsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const user = useOptionalUser();
  const result = Route.useLoaderData();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    document.title = t("myComplaints.metaTitle");
  }, [t]);

  const dateFormatter = new Intl.DateTimeFormat(locale === "hi" ? "hi-IN" : "en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const formatDate = (iso: string) => dateFormatter.format(new Date(iso));

  const statusLabel = (status: GrievanceStatus) =>
    t(`status.${status.toLowerCase()}` as TranslationKey);
  const priorityLabel = (priority: Priority) =>
    t(`priority.${priority.toLowerCase()}` as TranslationKey);

  async function refresh() {
    setRefreshing(true);
    try {
      // Re-runs the loader, which re-reads the session server-side.
      await router.invalidate();
    } finally {
      setRefreshing(false);
    }
  }

  /* ── sign-in gate (UX only; the server function enforces it) ── */

  if (user === null) {
    return (
      <CitizenShell>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <h1 className="font-serif text-2xl font-bold sm:text-3xl">{t("myComplaints.heading")}</h1>
          <Alert className="mt-6">
            <Info className="size-4" aria-hidden />
            <AlertTitle>{t("myComplaints.signInRequiredTitle")}</AlertTitle>
            <AlertDescription>{t("myComplaints.signInRequiredBody")}</AlertDescription>
          </Alert>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/login">{t("complaint.goToLogin")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/register">{t("login.registerLink")}</Link>
            </Button>
          </div>
        </div>
      </CitizenShell>
    );
  }

  /* ── load failure: say so rather than showing an empty list ── */

  if (!result.ok) {
    return (
      <CitizenShell>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <h1 className="font-serif text-2xl font-bold sm:text-3xl">{t("myComplaints.heading")}</h1>
          <Alert variant="destructive" className="mt-6" role="alert">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>{t("errors.genericTitle")}</AlertTitle>
            <AlertDescription>{t(`errors.${result.error}` as TranslationKey)}</AlertDescription>
          </Alert>
          <div className="mt-6">
            <Button onClick={() => void refresh()} disabled={refreshing}>
              <RefreshCw className={cn("mr-1 size-4", refreshing && "animate-spin")} aria-hidden />
              {t("common.retry")}
            </Button>
          </div>
        </div>
      </CitizenShell>
    );
  }

  const complaints: readonly MyComplaintSummary[] = result.complaints;

  return (
    <CitizenShell>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-bold sm:text-3xl">
              {t("myComplaints.heading")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {t("myComplaints.intro")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn("mr-1 size-3.5", refreshing && "animate-spin")}
                aria-hidden
              />
              {t("myComplaints.refresh")}
            </Button>
            <Button asChild size="sm">
              <Link to="/complaint">
                <FilePlus2 className="mr-1 size-3.5" aria-hidden />
                {t("myComplaints.fileNew")}
              </Link>
            </Button>
          </div>
        </div>

        {complaints.length === 0 ? (
          <Card className="mt-8">
            <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
              <Inbox className="size-10 text-muted-foreground" aria-hidden />
              <div>
                <h2 className="text-base font-semibold">{t("myComplaints.emptyTitle")}</h2>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {t("myComplaints.emptyBody")}
                </p>
              </div>
              <Button asChild>
                <Link to="/complaint">{t("myComplaints.fileNew")}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="mt-6 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("myComplaints.count", { count: complaints.length })}
            </p>

            <Card className="mt-3 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/60">
                    <TableHead className="px-4">{t("myComplaints.columnId")}</TableHead>
                    <TableHead>{t("myComplaints.columnTitle")}</TableHead>
                    <TableHead>{t("myComplaints.columnStatus")}</TableHead>
                    <TableHead>{t("myComplaints.columnDepartment")}</TableHead>
                    <TableHead>{t("myComplaints.columnPriority")}</TableHead>
                    <TableHead>{t("myComplaints.columnFiledAt")}</TableHead>
                    <TableHead className="px-4">{t("myComplaints.columnSlaDue")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {complaints.map((complaint) => {
                    const pending = complaint.routingState === "PENDING_MANUAL_REVIEW";
                    const stateLabel =
                      findState(complaint.state)?.[locale === "hi" ? "nativeName" : "name"] ??
                      complaint.state;
                    return (
                      <TableRow key={complaint.grievanceId} className="align-top">
                        <TableCell className="px-4 py-3">
                          <span className="stat-figure text-sm whitespace-nowrap text-primary">
                            {complaint.grievanceId}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className="block max-w-[22rem] font-medium">{complaint.title}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {complaint.district}, {stateLabel}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className={cn(BADGE_BASE, STATUS_STYLES[complaint.status])}>
                            {statusLabel(complaint.status)}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          {pending ? (
                            <span className="text-xs font-medium text-warning-foreground">
                              {t("myComplaints.pendingRouting")}
                            </span>
                          ) : (
                            <>
                              <span className="block text-sm">
                                {complaint.departmentId !== undefined
                                  ? departmentName(complaint.departmentId, locale)
                                  : (complaint.departmentName ?? t("myComplaints.notAvailable"))}
                              </span>
                              {complaint.category !== undefined ? (
                                <span className="mt-0.5 block text-xs text-muted-foreground">
                                  {complaint.category}
                                </span>
                              ) : null}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          {complaint.priority !== undefined ? (
                            <span className={cn(BADGE_BASE, PRIORITY_STYLES[complaint.priority])}>
                              {priorityLabel(complaint.priority)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {t("myComplaints.notAvailable")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-3 text-sm whitespace-nowrap">
                          {formatDate(complaint.filedAt)}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-sm whitespace-nowrap">
                          {complaint.slaDueAt !== undefined
                            ? formatDate(complaint.slaDueAt)
                            : t("myComplaints.notAvailable")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            {complaints.some((complaint) => complaint.routingState === "PENDING_MANUAL_REVIEW") ? (
              <Alert className="mt-5">
                <Info className="size-4" aria-hidden />
                <AlertDescription>{t("myComplaints.pendingRoutingNote")}</AlertDescription>
              </Alert>
            ) : null}
          </>
        )}
      </div>
    </CitizenShell>
  );
}
