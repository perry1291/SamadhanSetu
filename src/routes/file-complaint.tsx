import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  ImagePlus,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CitizenShell } from "@/components/gov/citizen-shell";
import { PriorityBadge } from "@/components/gov/badges";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { analyseGrievance, generateGrievanceId, type ClassificationResult } from "@/lib/ai";
import { DEPARTMENTS, LANGUAGES, departmentById, type Priority } from "@/lib/mock-data";

export const Route = createFileRoute("/file-complaint")({
  head: () => ({
    meta: [
      { title: "File a Grievance — SamadhanSetu" },
      {
        name: "description",
        content:
          "Lodge a public service grievance in your language. AI triage suggests the department and priority before you submit.",
      },
      { property: "og:title", content: "File a Grievance — SamadhanSetu" },
      {
        property: "og:description",
        content:
          "Submit a civic grievance with location and evidence. Receive a unique Grievance ID instantly.",
      },
    ],
  }),
  component: FileComplaintPage,
});

interface FormState {
  name: string;
  mobile: string;
  email: string;
  language: string;
  title: string;
  description: string;
  address: string;
  pincode: string;
  fileName: string;
}

const EMPTY: FormState = {
  name: "",
  mobile: "",
  email: "",
  language: "English",
  title: "",
  description: "",
  address: "",
  pincode: "",
  fileName: "",
};

function FileComplaintPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [analysing, setAnalysing] = useState(false);
  const [analysis, setAnalysis] = useState<ClassificationResult | null>(null);
  const [overrideDept, setOverrideDept] = useState<string>("");
  const [overridePriority, setOverridePriority] = useState<Priority | "">("");
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ id: string; dept: string; priority: Priority } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canAnalyse = form.title.trim().length > 5 && form.description.trim().length > 20;

  async function runAnalysis() {
    setError(null);
    if (!canAnalyse) {
      setError("Please enter a grievance title and a description of at least 20 characters.");
      return;
    }
    setAnalysing(true);
    setAnalysis(null);
    try {
      const result = await analyseGrievance({
        title: form.title,
        description: form.description,
        pincode: form.pincode,
        address: form.address,
        language: form.language,
      });
      setAnalysis(result);
      setOverrideDept(result.departmentId);
      setOverridePriority(result.priority);
    } catch {
      setError("AI triage service is temporarily unavailable. You may submit without analysis.");
    } finally {
      setAnalysing(false);
    }
  }

  async function submit() {
    setError(null);
    if (!form.name.trim() || !/^[6-9]\d{9}$/.test(form.mobile)) {
      setError("Please enter your name and a valid 10-digit Indian mobile number.");
      return;
    }
    if (!canAnalyse) {
      setError("Grievance title and description are required.");
      return;
    }
    if (!/^\d{6}$/.test(form.pincode)) {
      setError("Please enter a valid 6-digit pincode.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("http://localhost:4000/api/grievances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          language: form.language,
          location: { district: form.pincode }
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");

      const routed = data.grievance;

      setReceipt({
        id: routed._id.slice(-6).toUpperCase(), // Fake the ID aesthetic
        dept: routed.department?.name || "Unrouted / Default Assignment",
        priority: routed.severity as Priority,
      });
      toast.success("Grievance lodged via intelligent routing.");
    } catch (err: any) {
      setError("Network or Server error submitting real-time payload: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <CitizenShell>
        <div className="mx-auto max-w-3xl px-4 py-14">
          <Card className="border-success/40">
            <CardContent className="p-8 text-center">
              <CheckCircle2 className="mx-auto size-14 text-success" />
              <h1 className="mt-4 font-serif text-2xl font-bold">Grievance registered</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Please retain the Grievance ID below. An SMS acknowledgement has been sent to{" "}
                {form.mobile.replace(/^(\d{2})\d{5}/, "$1*****")}.
              </p>
              <div className="mt-6 rounded-md border bg-secondary/60 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Grievance ID / शिकायत क्रमांक
                </p>
                <p className="stat-figure mt-1 text-xl text-primary sm:text-2xl">{receipt.id}</p>
              </div>
              <dl className="mt-6 grid gap-4 text-left sm:grid-cols-2">
                <div className="rounded-md border p-4">
                  <dt className="text-xs text-muted-foreground">Routed to department</dt>
                  <dd className="mt-1 text-sm font-semibold">{receipt.dept}</dd>
                </div>
                <div className="rounded-md border p-4">
                  <dt className="text-xs text-muted-foreground">Assessed priority</dt>
                  <dd className="mt-1">
                    <PriorityBadge priority={receipt.priority} />
                  </dd>
                </div>
              </dl>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button asChild>
                  <Link to="/track">Track this grievance</Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => toast.success("Acknowledgement PDF download started.")}
                >
                  <Download className="mr-1 size-4" /> Download acknowledgement
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setReceipt(null);
                    setForm(EMPTY);
                    setAnalysis(null);
                  }}
                >
                  File another grievance
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </CitizenShell>
    );
  }

  return (
    <CitizenShell>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-serif text-3xl font-bold">File a Grievance</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Fields marked with an asterisk are mandatory. Your contact details are used only to update
          you on this grievance and are visible solely to the assigned officer.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">1. Citizen details / नागरिक विवरण</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name *</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Aditya Kulkarni"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mobile">Mobile number *</Label>
                  <Input
                    id="mobile"
                    inputMode="numeric"
                    maxLength={10}
                    value={form.mobile}
                    onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))}
                    placeholder="10-digit mobile"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="language">Preferred language</Label>
                  <Select value={form.language} onValueChange={(v) => set("language", v)}>
                    <SelectTrigger id="language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Grievance details / शिकायत विवरण</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Grievance title *</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="e.g. Potholes on Karve Road causing accidents"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">Detailed description *</Label>
                  <Textarea
                    id="description"
                    rows={6}
                    value={form.description}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder="Describe the problem, since when it exists and how it affects residents."
                  />
                  <p className="text-xs text-muted-foreground">
                    {form.description.length} characters · minimum 20
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">3. Location & evidence / स्थान एवं साक्ष्य</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="address">Address / landmark *</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder="Street, locality, ward"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pincode">Pincode *</Label>
                  <Input
                    id="pincode"
                    inputMode="numeric"
                    maxLength={6}
                    value={form.pincode}
                    onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))}
                    placeholder="411038"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="evidence">Photograph (optional)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="evidence"
                      type="file"
                      accept="image/*"
                      className="cursor-pointer"
                      onChange={(e) => set("fileName", e.target.files?.[0]?.name ?? "")}
                    />
                  </div>
                  {form.fileName ? (
                    <p className="flex items-center gap-1.5 text-xs text-success">
                      <ImagePlus className="size-3.5" /> {form.fileName} attached
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">JPG or PNG up to 5 MB</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {error ? (
              <Alert variant="destructive">
                <AlertTriangle className="size-4" />
                <AlertTitle>Cannot proceed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={runAnalysis} disabled={analysing}>
                {analysing ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Cpu className="mr-1 size-4" />
                )}
                {analysis ? "Re-run AI analysis" : "Run AI analysis"}
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                Submit grievance
              </Button>
            </div>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Cpu className="size-4 text-primary" /> AI triage preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysing ? (
                  <div className="space-y-3 py-2">
                    <p className="text-sm text-muted-foreground">
                      Analysing grievance text, category and location…
                    </p>
                    <Progress value={62} />
                    <p className="text-xs text-muted-foreground">
                      Checking for similar grievances in your pincode
                    </p>
                  </div>
                ) : !analysis ? (
                  <div className="py-4 text-center">
                    <Info className="mx-auto size-8 text-muted-foreground/60" />
                    <p className="mt-3 text-sm text-muted-foreground">
                      Enter the grievance title and description, then run AI analysis to see the
                      suggested department and priority. You may edit any suggestion before
                      submitting.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Suggested department
                      </Label>
                      <Select value={overrideDept} onValueChange={setOverrideDept}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DEPARTMENTS.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.shortName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Assessed priority
                      </Label>
                      <Select
                        value={overridePriority || analysis.priority}
                        onValueChange={(v) => setOverridePriority(v as Priority)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["High", "Medium", "Low"] as Priority[]).map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="uppercase tracking-wide text-muted-foreground">
                          Model confidence
                        </span>
                        <span className="stat-figure">{Math.round(analysis.confidence * 100)}%</span>
                      </div>
                      <Progress className="mt-2" value={analysis.confidence * 100} />
                    </div>

                    <div className="rounded-sm border bg-secondary/50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Reasoning
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed">{analysis.reasoning}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Category: {analysis.category}
                      </p>
                    </div>

                    {analysis.duplicate ? (
                      <div className="rounded-sm border border-saffron/50 bg-saffron/10 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-saffron-foreground">
                          <Copy className="size-3.5" /> Possible duplicate ·{" "}
                          {Math.round(analysis.duplicate.similarity * 100)}% similar
                        </p>
                        <p className="mt-2 text-sm font-medium">{analysis.duplicate.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {analysis.duplicate.grievanceId} · {analysis.duplicate.area} · filed{" "}
                          {analysis.duplicate.filedOn} · status {analysis.duplicate.status}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setDuplicateAcknowledged(true);
                              toast.info("You will receive updates on the existing grievance.");
                            }}
                          >
                            Follow existing grievance
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDuplicateAcknowledged(true)}
                          >
                            My issue is different
                          </Button>
                        </div>
                        {duplicateAcknowledged ? (
                          <p className="mt-2 text-xs text-success">Noted for officer review.</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-success">
                        <CheckCircle2 className="size-3.5" /> No similar open grievance found in
                        this area.
                      </p>
                    )}

                    <Separator />
                    <button
                      onClick={runAnalysis}
                      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                    >
                      <RefreshCw className="size-3.5" /> Re-analyse after editing
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="rounded-md border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Note
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                AI suggestions are advisory. The final department and priority are confirmed by the
                grievance cell, and you may edit any suggestion before submission.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </CitizenShell>
  );
}
