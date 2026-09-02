import { cn } from "@/lib/utils";
import type { GrievanceStatus, Priority } from "@/lib/mock-data";

const STATUS_STYLES: Record<GrievanceStatus, string> = {
  Submitted: "bg-secondary text-secondary-foreground border-border",
  "Under Review": "bg-info/10 text-info border-info/30",
  Assigned: "bg-primary/10 text-primary border-primary/30",
  "In Progress": "bg-warning/15 text-warning-foreground border-warning/40",
  Resolved: "bg-success/12 text-success border-success/30",
  Closed: "bg-muted text-muted-foreground border-border",
};

const PRIORITY_STYLES: Record<Priority, string> = {
  High: "bg-destructive/10 text-destructive border-destructive/30",
  Medium: "bg-saffron/15 text-saffron-foreground border-saffron/40",
  Low: "bg-secondary text-secondary-foreground border-border",
};

const base =
  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap";

export function StatusBadge({
  status,
  className,
}: {
  status: GrievanceStatus;
  className?: string;
}) {
  return <span className={cn(base, STATUS_STYLES[status], className)}>{status}</span>;
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  return (
    <span className={cn(base, PRIORITY_STYLES[priority], className)}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          priority === "High" && "bg-destructive",
          priority === "Medium" && "bg-saffron",
          priority === "Low" && "bg-muted-foreground",
        )}
      />
      {priority}
    </span>
  );
}

export function SlaBadge({ daysPending, slaDays }: { daysPending: number; slaDays: number }) {
  const breached = daysPending > slaDays;
  const nearing = !breached && daysPending >= slaDays - 2;
  return (
    <span
      className={cn(
        base,
        breached
          ? "bg-destructive/10 text-destructive border-destructive/30"
          : nearing
            ? "bg-warning/15 text-warning-foreground border-warning/40"
            : "bg-success/12 text-success border-success/30",
      )}
    >
      {breached ? "SLA breached" : nearing ? "SLA nearing" : "Within SLA"}
    </span>
  );
}
