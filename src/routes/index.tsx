import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ClipboardList,
  Cpu,
  FileSearch,
  Languages,
  Route as RouteIcon,
  ShieldCheck,
  Timer,
} from "lucide-react";

import { CitizenShell } from "@/components/gov/citizen-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DEPARTMENTS, PLATFORM_STATS } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SamadhanSetu — Citizen Grievance Redressal Platform" },
      {
        name: "description",
        content:
          "File, track and resolve public service grievances with AI-assisted routing, SLA monitoring and department-wise accountability.",
      },
      { property: "og:title", content: "SamadhanSetu — Your Voice, Our Action" },
      {
        property: "og:description",
        content:
          "A single-window government grievance redressal platform with AI classification, duplicate detection and transparent SLA tracking.",
      },
    ],
  }),
  component: LandingPage,
});

const STEPS = [
  {
    icon: ClipboardList,
    title: "Submit",
    hindi: "शिकायत दर्ज",
    text: "Lodge your grievance in your preferred language with location and optional photographic evidence.",
  },
  {
    icon: Cpu,
    title: "Analyze",
    hindi: "विश्लेषण",
    text: "AI triage identifies the category, assesses priority and flags possible duplicate grievances.",
  },
  {
    icon: RouteIcon,
    title: "Route",
    hindi: "विभाग आवंटन",
    text: "The grievance is routed to the accountable department and assigned to a named officer.",
  },
  {
    icon: BadgeCheck,
    title: "Resolve",
    hindi: "निवारण",
    text: "Action is taken within the departmental SLA with evidence-backed closure and citizen confirmation.",
  },
];

const PRINCIPLES = [
  { icon: Timer, title: "Time-bound SLAs", text: "Every department carries a published resolution window with automatic escalation on breach." },
  { icon: ShieldCheck, title: "Privacy by design", text: "Citizen contact details are visible only to the assigned officer and audit authority." },
  { icon: Languages, title: "Multilingual ready", text: "Grievances can be filed in 8 Indian languages with officer-side translation support." },
  { icon: FileSearch, title: "Full audit trail", text: "Each status change, note and assignment is permanently recorded and citizen-visible." },
];

const nf = new Intl.NumberFormat("en-IN");

function LandingPage() {
  return (
    <CitizenShell>
      <section className="border-b bg-card">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-sm border border-saffron/40 bg-saffron/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-saffron-foreground">
              SIH26-S02 · National Grievance Mission
            </p>
            <h1 className="mt-5 font-serif text-4xl leading-tight font-bold text-foreground sm:text-5xl">
              Your Voice, Our Action
            </h1>
            <p className="mt-2 font-serif text-xl text-primary">आपकी आवाज़, हमारी कार्रवाई</p>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
              SamadhanSetu is the single window for citizens to lodge grievances relating to roads,
              water, sanitation, electricity, public health, transport and revenue services. Every
              grievance is classified, routed to the accountable department and monitored against a
              published service-level commitment.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/file-complaint">
                  File a Grievance <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/track">Track Existing Grievance</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No login required to lodge a grievance. An acknowledgement with a unique Grievance ID
              is issued immediately.
            </p>
          </div>

          <Card className="self-start shadow-raised">
            <CardContent className="p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Grievance status at a glance
              </h2>
              <dl className="mt-5 grid grid-cols-2 gap-5">
                <div>
                  <dd className="stat-figure text-3xl text-primary">{nf.format(PLATFORM_STATS.received)}</dd>
                  <dt className="mt-1 text-xs text-muted-foreground">Grievances received</dt>
                </div>
                <div>
                  <dd className="stat-figure text-3xl text-success">{nf.format(PLATFORM_STATS.resolved)}</dd>
                  <dt className="mt-1 text-xs text-muted-foreground">Grievances resolved</dt>
                </div>
                <div>
                  <dd className="stat-figure text-3xl text-foreground">{PLATFORM_STATS.departments}</dd>
                  <dt className="mt-1 text-xs text-muted-foreground">Departments onboarded</dt>
                </div>
                <div>
                  <dd className="stat-figure text-3xl text-foreground">{PLATFORM_STATS.avgResolutionDays} days</dd>
                  <dt className="mt-1 text-xs text-muted-foreground">Average resolution time</dt>
                </div>
              </dl>
              <div className="mt-6 rounded-sm border bg-secondary/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  SLA compliance this quarter
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-success"
                      style={{ width: `${PLATFORM_STATS.slaCompliance}%` }}
                    />
                  </div>
                  <span className="stat-figure text-sm">{PLATFORM_STATS.slaCompliance}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <h2 className="font-serif text-2xl font-bold">How your grievance is handled</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A four-stage process with defined ownership at every stage.
        </p>
        <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card-surface rounded-md p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-sm bg-primary/10 text-primary">
                  <step.icon className="size-5" />
                </span>
                <span className="stat-figure text-2xl text-border">0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
              <p className="text-xs text-primary">{step.hindi}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <h2 className="font-serif text-2xl font-bold">Departments on the platform</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Each department publishes a resolution SLA and a nodal officer accountable for redressal.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DEPARTMENTS.map((d) => (
              <div key={d.id} className="rounded-md border bg-background p-4">
                <div className="flex items-start gap-3">
                  <Building2 className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold leading-snug">{d.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Nodal officer: {d.nodalOfficer}
                    </p>
                    <p className="mt-2 inline-flex rounded-sm bg-secondary px-2 py-0.5 text-xs font-medium">
                      SLA {d.slaDays} working days
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <h2 className="font-serif text-2xl font-bold">Built for accountability</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p) => (
            <div key={p.title}>
              <p.icon className="size-6 text-saffron" />
              <h3 className="mt-3 text-sm font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-5 px-4 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-bold">Facing a civic problem in your area?</h2>
            <p className="mt-1.5 text-sm opacity-85">
              Lodge it now — you will receive a Grievance ID and SMS updates at every stage.
            </p>
          </div>
          <Button asChild size="lg" variant="secondary">
            <Link to="/file-complaint">Start Now</Link>
          </Button>
        </div>
      </section>
    </CitizenShell>
  );
}
