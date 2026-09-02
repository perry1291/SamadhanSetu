/**
 * Citizen complaint intake — voice or form.
 *
 * Requires an authenticated citizen. The route only hides the form for
 * convenience; the server function independently rejects anonymous callers, so
 * this check is UX, not the control.
 *
 * Deliberately absent: any department or priority selector. The citizen
 * describes the problem and the server decides routing, which the page states
 * explicitly rather than leaving implicit.
 *
 * All text comes from the shared i18n resources.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Cpu,
  FileText,
  ImagePlus,
  Info,
  Loader2,
  MapPin,
  Mic,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { CitizenShell } from "@/components/gov/citizen-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/i18n/use-translation";
import type { TranslationKey } from "@/i18n/translations";
import { departmentName } from "@/lib/departments";
import { districtsOf, statesForDisplay } from "@/lib/locations";
import { submitComplaintFn, transcribeVoiceFn } from "@/lib/complaint-api";
import {
  discardEvidenceFn,
  precheckDuplicatesFn,
  uploadEvidenceFn,
  type RelatedComplaint,
} from "@/lib/evidence-api";
import { useOptionalUser } from "@/lib/use-optional-user";
import type {
  ComplaintFormValues,
  ComplaintLanguage,
  IntakeMethod,
  Priority,
} from "@/lib/validation/complaint";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_COMPLAINT,
  type EvidenceSummary,
} from "@/lib/validation/evidence";
import type { ErrorCode } from "@/lib/validation/registration";

export const Route = createFileRoute("/complaint")({
  head: () => ({
    meta: [
      { title: "File a Complaint — SamadhanSetu" },
      {
        name: "description",
        content:
          "Submit a public service complaint by voice or by form. The department and priority are determined automatically.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComplaintPage,
});

type Stage = "choose" | "voice" | "transcript" | "form" | "done";

interface SubmissionSummary {
  grievanceId: string;
  status: string;
  filedAt: string;
  slaDueAt?: string;
  originalLanguage: ComplaintLanguage;
  classification: {
    state: "AI_CLASSIFIED" | "PENDING_MANUAL_REVIEW";
    departmentId?: string;
    departmentName?: string;
    category?: string;
    priority?: Priority;
    confidence?: number;
    reasoning?: string;
  };
  evidenceCount: number;
  duplicate: {
    status: string;
    related: RelatedComplaint[];
  };
}

/**
 * One attached photograph, as the picker tracks it.
 *
 * `previewUrl` is a local `blob:` URL created from the citizen's own file. The
 * preview deliberately does NOT come from storage: showing it from a remote URL
 * would mean issuing a signed URL for an image that is not yet attached to any
 * complaint, and the file is already on this device anyway.
 */
interface AttachedImage {
  draftId: string;
  summary: EvidenceSummary;
  previewUrl: string;
}

const EMPTY_FORM: ComplaintFormValues = {
  title: "",
  description: "",
  address: "",
  state: "",
  district: "",
  pincode: "",
};

const SELECT_CLASS =
  "h-9 w-full rounded-sm border border-input bg-background px-3 py-1 text-sm " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/** Label / hint / error wrapper with consistent a11y wiring. */
function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  required?: boolean | undefined;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    "aria-required": boolean | undefined;
  }) => ReactNode;
}) {
  const hintId = hint !== undefined ? `${id}-hint` : undefined;
  const errorId = error !== undefined ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
        {required === true ? (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error !== undefined ? true : undefined,
        "aria-required": required === true ? true : undefined,
      })}
      {hint !== undefined ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error !== undefined ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ComplaintPage() {
  const { t, locale } = useTranslation();
  const uid = useId();
  const user = useOptionalUser();

  const [stage, setStage] = useState<Stage>("choose");
  const [method, setMethod] = useState<IntakeMethod>("FORM");
  const [form, setForm] = useState<ComplaintFormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, ErrorCode>>({});
  const [formError, setFormError] = useState<ErrorCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmissionSummary | null>(null);

  // Voice state
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [voiceNotice, setVoiceNotice] = useState<TranslationKey | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [rawTranscript, setRawTranscript] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState<ComplaintLanguage>("other");

  // Optional coordinates, only ever from an explicit citizen action.
  /* evidence */
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<ErrorCode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* duplicate warning */
  const [duplicates, setDuplicates] = useState<RelatedComplaint[]>([]);
  const [duplicateChecking, setDuplicateChecking] = useState(false);
  /**
   * True once the citizen has seen the warning and chosen to continue. Gates the
   * second submit press only — it never prevents filing, and is cleared whenever
   * the complaint text changes so a stale acknowledgement cannot carry over.
   */
  const [duplicatesAcknowledged, setDuplicatesAcknowledged] = useState(false);

  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracyMetres?: number;
  } | null>(null);
  const [geoError, setGeoError] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    document.title = t("complaint.metaTitle");
  }, [t]);

  // Release the object URL and any live microphone track on unmount.
  useEffect(
    () => () => {
      if (audioUrl !== null) URL.revokeObjectURL(audioUrl);
      if (timerRef.current !== null) clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    },
    [audioUrl],
  );

  // Preview URLs are per-image blobs, released together when the page unmounts.
  const imagesRef = useRef<AttachedImage[]>([]);
  imagesRef.current = images;
  useEffect(
    () => () => {
      imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    },
    [],
  );

  const states = useMemo(() => statesForDisplay(locale), [locale]);
  const districts = useMemo(() => districtsOf(form.state), [form.state]);

  const errorText = (errorCode: ErrorCode | undefined): string | undefined =>
    errorCode === undefined ? undefined : t(`errors.${errorCode}` as TranslationKey);
  const fieldError = (name: string): string | undefined => errorText(fieldErrors[name]);

  function set<K extends keyof ComplaintFormValues>(key: K, value: ComplaintFormValues[K]) {
    setForm((previous) =>
      key === "state"
        ? { ...previous, state: value as string, district: "" }
        : { ...previous, [key]: value },
    );
    setFieldErrors((previous) => {
      if (previous[key] === undefined) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
    // Editing what the check was based on invalidates its result. Re-checking on
    // the next submit is honest; carrying an old verdict forward is not.
    if (key === "title" || key === "description" || key === "district" || key === "pincode") {
      setDuplicates([]);
      setDuplicatesAcknowledged(false);
    }
  }

  const languageLabel = (language: ComplaintLanguage): string =>
    t(
      language === "hi"
        ? "complaint.languageHindi"
        : language === "en"
          ? "complaint.languageEnglish"
          : "complaint.languageOther",
    );

  /* ────────── voice recording ────────── */

  function pickMimeType(): string {
    // Chrome/Firefox produce webm/opus; Safari produces mp4. Both are accepted
    // server-side, so use whichever the browser actually supports.
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (const candidate of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }
    return "";
  }

  async function startRecording() {
    setVoiceNotice(null);
    setFormError(null);
    if (typeof navigator === "undefined" || navigator.mediaDevices?.getUserMedia === undefined) {
      setVoiceNotice("complaint.voiceUnsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType === "" ? undefined : { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType === "" ? "audio/webm" : recorder.mimeType,
        });
        setAudioBlob(blob);
        setAudioUrl((previous) => {
          if (previous !== null) URL.revokeObjectURL(previous);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      // Permission refused, or no microphone present.
      setVoiceNotice("complaint.voicePermissionDenied");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function discardRecording() {
    setAudioBlob(null);
    setAudioUrl((previous) => {
      if (previous !== null) URL.revokeObjectURL(previous);
      return null;
    });
    setSeconds(0);
    setDraftId(null);
    setRawTranscript("");
    setVoiceNotice(null);
  }

  /** Uploads the audio and moves to transcript review. Never fabricates text. */
  async function transcribe() {
    if (audioBlob === null) return;
    setFormError(null);
    setBusy(true);
    try {
      const payload = new FormData();
      const extension = audioBlob.type.includes("mp4") ? "mp4" : "webm";
      payload.set(
        "audio",
        new File([audioBlob], `complaint.${extension}`, { type: audioBlob.type }),
      );
      const response = await transcribeVoiceFn({ data: payload });
      if (!response.ok) {
        setFormError(response.error);
        return;
      }
      setDraftId(response.draftId);
      setRawTranscript(response.transcript);
      setDetectedLanguage(response.detectedLanguage);
      // The transcript seeds the description; the citizen can correct it.
      setForm((previous) => ({ ...previous, description: response.transcript }));
      setStage("transcript");
    } catch {
      setFormError("server_error");
    } finally {
      setBusy(false);
    }
  }

  /* ────────── geolocation (explicit, optional) ────────── */

  function attachLocation() {
    setGeoError(false);
    if (typeof navigator === "undefined" || navigator.geolocation === undefined) {
      setGeoError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          ...(Number.isFinite(position.coords.accuracy)
            ? { accuracyMetres: position.coords.accuracy }
            : {}),
        });
      },
      // Nothing is stored on failure; no coordinates are ever guessed.
      () => setGeoError(true),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  /* ────────── evidence (optional photographs) ────────── */

  /**
   * Client-side checks here are for immediate feedback only. The server repeats
   * every one of them and additionally decodes the image, so nothing depends on
   * this passing.
   */
  async function addImage(file: File) {
    setImageError(null);
    if (images.length >= MAX_IMAGES_PER_COMPLAINT) {
      setImageError("evidence_too_many");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("evidence_too_large");
      return;
    }
    if (file.type !== "" && !ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
      setImageError("evidence_unsupported_format");
      return;
    }

    setImageBusy(true);
    try {
      const body = new FormData();
      body.set("image", file);
      const response = await uploadEvidenceFn({ data: body });
      if (!response.ok) {
        setImageError(response.error);
        return;
      }
      setImages((previous) => [
        ...previous,
        {
          draftId: response.draftId,
          summary: response.evidence,
          // Local blob: the file is already here, so no signed URL is needed.
          previewUrl: URL.createObjectURL(file),
        },
      ]);
    } catch {
      setImageError("evidence_upload_failed");
    } finally {
      setImageBusy(false);
    }
  }

  function removeImage(draftId: string) {
    setImageError(null);
    const target = images.find((image) => image.draftId === draftId);
    if (target !== undefined) URL.revokeObjectURL(target.previewUrl);
    setImages((previous) => previous.filter((image) => image.draftId !== draftId));
    // Best effort server-side cleanup; the draft also expires on its own.
    void discardEvidenceFn({ data: { draftId } }).catch(() => undefined);
  }

  /* ────────── submission ────────── */

  /**
   * Submits, with one duplicate warning in between.
   *
   * The first press runs the advisory check. If similar complaints come back, the
   * warning is shown and submission pauses so the citizen can decide — the second
   * press files it regardless of what the check found. A suspicion never blocks a
   * complaint; it only earns one look.
   */
  async function submit() {
    setFormError(null);
    setFieldErrors({});

    if (!duplicatesAcknowledged) {
      setDuplicateChecking(true);
      try {
        const found = await precheckDuplicatesFn({
          data: {
            title: form.title,
            description: form.description,
            state: form.state,
            district: form.district,
            ...(form.pincode !== "" ? { pincode: form.pincode } : {}),
            ...(coords !== null
              ? { coordinates: { latitude: coords.latitude, longitude: coords.longitude } }
              : {}),
          },
        });
        if (found.related.length > 0) {
          setDuplicates(found.related);
          // Pause exactly once. The next press proceeds.
          setDuplicatesAcknowledged(true);
          setDuplicateChecking(false);
          return;
        }
      } catch {
        // Advisory only: a failed check must not stand between the citizen and
        // filing, so fall through and submit.
      }
      setDuplicatesAcknowledged(true);
      setDuplicateChecking(false);
    }

    setBusy(true);
    try {
      const response = await submitComplaintFn({
        data: {
          intakeMethod: method,
          title: form.title,
          description: form.description,
          address: form.address,
          state: form.state,
          district: form.district,
          pincode: form.pincode,
          ...(coords !== null ? { coordinates: coords } : {}),
          ...(method === "VOICE" && draftId !== null ? { voiceDraftId: draftId } : {}),
          ...(images.length > 0 ? { evidenceDraftIds: images.map((image) => image.draftId) } : {}),
          ...(duplicates.length > 0 ? { duplicateAcknowledged: true } : {}),
        },
      });
      if (!response.ok) {
        setFormError(response.error);
        if (response.fieldErrors !== undefined) setFieldErrors(response.fieldErrors);
        // Drafts were consumed or rejected server-side; clear the picker so the
        // citizen is not shown images that are no longer attachable.
        if (response.error.startsWith("evidence_")) {
          images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
          setImages([]);
        }
        return;
      }
      setResult({
        grievanceId: response.grievanceId,
        status: response.status,
        filedAt: response.filedAt,
        ...(response.slaDueAt !== undefined ? { slaDueAt: response.slaDueAt } : {}),
        originalLanguage: response.originalLanguage,
        classification: response.classification,
        evidenceCount: response.evidenceCount,
        duplicate: response.duplicate,
      });
      images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setImages([]);
      setStage("done");
    } catch {
      setFormError("server_error");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setForm(EMPTY_FORM);
    discardRecording();
    setCoords(null);
    setGeoError(false);
    setResult(null);
    setFieldErrors({});
    setFormError(null);
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setImages([]);
    setImageError(null);
    setDuplicates([]);
    setDuplicatesAcknowledged(false);
    setStage("choose");
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "hi" ? "hi-IN" : "en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  /** Localised file size. Uses the stored size after sanitisation, not the original. */
  const formatBytes = (bytes: number): string => {
    const asKb = bytes / 1024;
    return asKb < 1024
      ? `${Math.round(asKb).toLocaleString(locale === "hi" ? "hi-IN" : "en-IN")} KB`
      : `${(asKb / 1024).toLocaleString(locale === "hi" ? "hi-IN" : "en-IN", {
          maximumFractionDigits: 1,
        })} MB`;
  };

  const statusLabel = (status: string): string =>
    t(`status.${status.toLowerCase()}` as TranslationKey);

  /**
   * Renders the relationship as a translated sentence.
   *
   * The server sends a closed reason code rather than prose precisely so this can
   * be written in natural Hindi, and so no text derived from the other citizen's
   * complaint reaches the browser.
   */
  const duplicateReasonText = (related: RelatedComplaint): string => {
    if (related.reasonCode === "NEARBY_SIMILAR") {
      return t("complaint.duplicateReasonNearby", {
        distance: (related.approxDistanceMetres ?? 0).toLocaleString(
          locale === "hi" ? "hi-IN" : "en-IN",
        ),
      });
    }
    return related.reasonCode === "SAME_PINCODE_SIMILAR"
      ? t("complaint.duplicateReasonPincode")
      : t("complaint.duplicateReasonDistrict");
  };

  /* ────────── sign-in gate (UX only; server enforces) ────────── */

  if (user === null) {
    return (
      <CitizenShell>
        <div className="mx-auto max-w-2xl px-4 py-12">
          <h1 className="font-serif text-2xl font-bold sm:text-3xl">{t("complaint.heading")}</h1>
          <Alert className="mt-6">
            <Info className="size-4" aria-hidden />
            <AlertTitle>{t("complaint.signInRequiredTitle")}</AlertTitle>
            <AlertDescription>{t("complaint.signInRequiredBody")}</AlertDescription>
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

  /* ────────── confirmation ────────── */

  if (stage === "done" && result !== null) {
    const c = result.classification;
    const classified = c.state === "AI_CLASSIFIED";
    return (
      <CitizenShell>
        <div className="mx-auto max-w-3xl px-4 py-10">
          <Card className={classified ? "border-success/40" : "border-warning/50"}>
            <CardContent className="p-6 sm:p-8">
              <div className="text-center">
                <CheckCircle2 className="mx-auto size-14 text-success" aria-hidden />
                <h1 className="mt-4 font-serif text-2xl font-bold">
                  {t("complaint.resultHeading")}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">{t("complaint.resultBody")}</p>
              </div>

              <div className="mt-6 rounded-md border bg-secondary/60 p-4 text-center">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("complaint.resultGrievanceId")}
                </p>
                <p className="stat-figure mt-1 text-xl text-primary sm:text-2xl">
                  {result.grievanceId}
                </p>
              </div>

              {classified ? (
                <>
                  <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-md border p-4 sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">
                        {t("complaint.resultDepartment")}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold">
                        {c.departmentId !== undefined
                          ? departmentName(c.departmentId, locale)
                          : (c.departmentName ?? "—")}
                      </dd>
                    </div>
                    <div className="rounded-md border p-4">
                      <dt className="text-xs text-muted-foreground">
                        {t("complaint.resultPriority")}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold">
                        {c.priority !== undefined
                          ? t(`priority.${c.priority.toLowerCase()}` as TranslationKey)
                          : "—"}
                      </dd>
                    </div>
                    <div className="rounded-md border p-4">
                      <dt className="text-xs text-muted-foreground">
                        {t("complaint.resultCategory")}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold">{c.category ?? "—"}</dd>
                    </div>
                    <div className="rounded-md border p-4">
                      <dt className="text-xs text-muted-foreground">
                        {t("complaint.resultStatus")}
                      </dt>
                      <dd className="mt-1 text-sm font-semibold">
                        {t("complaint.statusSubmitted")}
                      </dd>
                    </div>
                    {result.slaDueAt !== undefined ? (
                      <div className="rounded-md border p-4">
                        <dt className="text-xs text-muted-foreground">
                          {t("complaint.resultSlaDue")}
                        </dt>
                        <dd className="mt-1 text-sm font-semibold">
                          {formatDate(result.slaDueAt)}
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {c.reasoning !== undefined ? (
                    <div className="mt-4 rounded-md border bg-secondary/50 p-4">
                      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        <Cpu className="size-3.5" aria-hidden />
                        {t("complaint.resultReasoning")}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed">{c.reasoning}</p>
                      {c.confidence !== undefined ? (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {t("complaint.resultConfidence")}
                            </span>
                            <span className="stat-figure">{Math.round(c.confidence * 100)}%</span>
                          </div>
                          <Progress className="mt-1.5" value={c.confidence * 100} />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <p className="mt-4 text-xs text-muted-foreground">
                    {t("complaint.resultAutoNote")}
                  </p>
                </>
              ) : (
                <Alert className="mt-6">
                  <AlertTriangle className="size-4" aria-hidden />
                  <AlertTitle>{t("complaint.resultPendingReviewTitle")}</AlertTitle>
                  <AlertDescription>{t("complaint.resultPendingReviewBody")}</AlertDescription>
                </Alert>
              )}

              {result.evidenceCount > 0 ? (
                <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-success">
                  <ImagePlus className="size-3.5" aria-hidden />
                  {t("complaint.resultEvidenceStored", { count: result.evidenceCount })}
                </p>
              ) : null}

              {/* Every duplicate outcome is reported honestly, including the case
                  where the check could not be completed. NOT_DUPLICATE shows
                  nothing, since there is nothing for the citizen to act on. */}
              {result.duplicate.status === "HIGH_CONFIDENCE_DUPLICATE" ||
              result.duplicate.status === "POSSIBLE_DUPLICATE" ? (
                <Alert className="mt-4 border-warning/60 bg-warning/5">
                  <Copy className="size-4 text-warning" aria-hidden />
                  <AlertTitle>
                    {result.duplicate.status === "HIGH_CONFIDENCE_DUPLICATE"
                      ? t("complaint.resultDuplicateHighTitle")
                      : t("complaint.resultDuplicatePossibleTitle")}
                  </AlertTitle>
                  <AlertDescription>
                    <p>
                      {result.duplicate.status === "HIGH_CONFIDENCE_DUPLICATE"
                        ? t("complaint.resultDuplicateHighBody")
                        : t("complaint.resultDuplicatePossibleBody")}
                    </p>
                    {result.duplicate.related.length > 0 ? (
                      <p className="mt-2 text-xs">
                        {t("complaint.resultDuplicateRelated")}:{" "}
                        {result.duplicate.related.map((related) => related.grievanceId).join(", ")}
                      </p>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : result.duplicate.status === "ANALYSIS_UNAVAILABLE" ? (
                <Alert className="mt-4">
                  <Info className="size-4" aria-hidden />
                  <AlertTitle>{t("complaint.resultDuplicateUnavailableTitle")}</AlertTitle>
                  <AlertDescription>
                    {t("complaint.resultDuplicateUnavailableBody")}
                  </AlertDescription>
                </Alert>
              ) : null}

              <p className="mt-4 text-xs text-muted-foreground">
                {t("complaint.resultNoNotificationNote")}
              </p>

              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button onClick={reset}>{t("complaint.fileAnother")}</Button>
                <Button asChild variant="outline">
                  <Link to="/">{t("complaint.backHome")}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </CitizenShell>
    );
  }

  /* ────────── shared location + submit block ────────── */

  const locationBlock = (
    <section aria-labelledby={`${uid}-loc`}>
      <h2
        id={`${uid}-loc`}
        className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-primary uppercase"
      >
        <MapPin className="size-4" aria-hidden />
        {t("complaint.sectionLocation")}
      </h2>
      <Separator className="mt-2 mb-4" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${uid}-address`}
          label={t("complaint.address")}
          hint={t("complaint.addressHint")}
          error={fieldError("address")}
          required
        >
          {(props) => (
            <Input
              {...props}
              maxLength={300}
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          )}
        </Field>
        <Field
          id={`${uid}-pincode`}
          label={`${t("complaint.pincode")} (${t("common.optional")})`}
          error={fieldError("pincode")}
        >
          {(props) => (
            <Input
              {...props}
              inputMode="numeric"
              maxLength={6}
              value={form.pincode}
              onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))}
            />
          )}
        </Field>
        <Field
          id={`${uid}-state`}
          label={t("complaint.state")}
          error={fieldError("state")}
          required
        >
          {(props) => (
            <select
              {...props}
              className={SELECT_CLASS}
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
            >
              <option value="">{t("common.selectPlaceholder")}</option>
              {states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          id={`${uid}-district`}
          label={t("complaint.district")}
          hint={form.state === "" ? t("complaint.districtSelectStateFirst") : undefined}
          error={fieldError("district")}
          required
        >
          {(props) => (
            <select
              {...props}
              className={SELECT_CLASS}
              value={form.district}
              disabled={form.state === ""}
              onChange={(e) => set("district", e.target.value)}
            >
              <option value="">{t("common.selectPlaceholder")}</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <div className="mt-4 rounded-md border bg-secondary/40 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={attachLocation}>
            <MapPin className="mr-1 size-3.5" aria-hidden />
            {t("complaint.useMyLocation")}
          </Button>
          {coords !== null ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-success">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {t("complaint.locationAttached")}
            </span>
          ) : null}
          {geoError ? (
            <span className="text-xs font-medium text-destructive">
              {t("complaint.locationUnavailable")}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("complaint.locationOptionalNote")}</p>
      </div>
    </section>
  );

  /* ────────── evidence picker ────────── */

  const evidenceBlock = (
    <section aria-labelledby={`${uid}-evidence`}>
      <h2
        id={`${uid}-evidence`}
        className="flex items-center gap-1.5 text-sm font-semibold tracking-wide text-primary uppercase"
      >
        <ImagePlus className="size-4" aria-hidden />
        {t("complaint.sectionEvidence")}
        <span className="text-xs font-normal normal-case">({t("common.optional")})</span>
      </h2>
      <Separator className="mt-2 mb-4" />

      <p className="text-sm text-muted-foreground">{t("complaint.evidenceIntro")}</p>

      {imageError !== null ? (
        <Alert variant="destructive" className="mt-4" role="alert">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertDescription>{errorText(imageError)}</AlertDescription>
        </Alert>
      ) : null}

      {images.length > 0 ? (
        <ul
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          aria-label={t("complaint.evidenceListLabel")}
        >
          {images.map((image) => (
            <li key={image.draftId} className="overflow-hidden rounded-md border bg-card">
              {/* Preview comes from the local file, never from storage. */}
              <img
                src={image.previewUrl}
                alt={t("complaint.evidencePreviewAlt", { name: image.summary.displayName })}
                className="h-36 w-full bg-secondary/40 object-cover"
              />
              <div className="flex items-start justify-between gap-2 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium" title={image.summary.displayName}>
                    {image.summary.displayName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatBytes(image.summary.bytes)} · {image.summary.width}×
                    {image.summary.height}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-destructive"
                  aria-label={t("complaint.evidenceRemoveLabel", {
                    name: image.summary.displayName,
                  })}
                  onClick={() => removeImage(image.draftId)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 rounded-md border bg-secondary/40 p-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Hidden native input, driven by the visible button for consistent styling. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            // Only the file picker writes here, so the value is reset after each
            // choice to allow re-selecting the same file.
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) void addImage(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={imageBusy || images.length >= MAX_IMAGES_PER_COMPLAINT}
            onClick={() => fileInputRef.current?.click()}
          >
            {imageBusy ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="mr-1 size-3.5" aria-hidden />
            )}
            {imageBusy ? t("complaint.evidenceUploading") : t("complaint.evidenceAdd")}
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {images.length >= MAX_IMAGES_PER_COMPLAINT
              ? t("complaint.evidenceFull")
              : t("complaint.evidenceAttachedCount", {
                  count: images.length,
                  max: MAX_IMAGES_PER_COMPLAINT,
                })}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("complaint.evidenceLimits")}</p>
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
          {t("complaint.evidencePrivacyNote")}
        </p>
      </div>
    </section>
  );

  /* ────────── duplicate warning ────────── */

  /**
   * Shown only when the advisory check actually found something. When the check
   * could not run, nothing is displayed — claiming "no duplicates found" would
   * assert a result the system never obtained.
   */
  const duplicateBlock =
    duplicates.length === 0 ? null : (
      <Alert className="border-warning/60 bg-warning/5" role="status">
        <AlertTriangle className="size-4 text-warning" aria-hidden />
        <AlertTitle>{t("complaint.duplicateHeading")}</AlertTitle>
        <AlertDescription>
          <p>{t("complaint.duplicateIntro")}</p>

          <ul className="mt-3 space-y-3">
            {duplicates.map((related) => (
              <li key={related.grievanceId} className="rounded-md border bg-card/60 p-3">
                <dl className="grid gap-2 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">
                      {t("complaint.duplicateComplaintNumber")}
                    </dt>
                    <dd className="stat-figure mt-0.5 text-sm text-primary">
                      {related.grievanceId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("complaint.duplicateArea")}
                    </dt>
                    {/* District only. The other citizen's address is never sent. */}
                    <dd className="mt-0.5 text-sm font-medium">{related.area}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("complaint.duplicateFiledOn")}
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium">{formatDate(related.filedOn)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("complaint.duplicateStatus")}
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium">{statusLabel(related.status)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("complaint.duplicateSimilarity")}
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium">{related.similarityPercent}%</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">
                      {t("complaint.duplicateReason")}
                    </dt>
                    <dd className="mt-0.5 text-sm">{duplicateReasonText(related)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs">{t("complaint.duplicatePrivacyNote")}</p>
          <p className="mt-1.5 text-xs font-medium">{t("complaint.duplicateNotBlockedNote")}</p>
        </AlertDescription>
      </Alert>
    );

  const submitButton = (
    <div className="flex flex-wrap gap-3">
      <Button type="submit" size="lg" disabled={busy || duplicateChecking}>
        {busy || duplicateChecking ? (
          <Loader2 className="mr-1 size-4 animate-spin" aria-hidden />
        ) : (
          <Send className="mr-1 size-4" aria-hidden />
        )}
        {duplicateChecking
          ? t("complaint.duplicateChecking")
          : busy
            ? t("complaint.submitting")
            : // After a warning, the same control says plainly what it will do.
              duplicates.length > 0
              ? t("complaint.submitAnyway")
              : t("complaint.submit")}
      </Button>
      <Button type="button" variant="ghost" size="lg" onClick={reset}>
        {t("complaint.changeMethod")}
      </Button>
    </div>
  );

  /* ────────── page ────────── */

  return (
    <CitizenShell>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">{t("complaint.heading")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t("complaint.intro")}
        </p>

        <Alert className="mt-5">
          <Cpu className="size-4" aria-hidden />
          <AlertDescription>{t("complaint.autoRoutingNotice")}</AlertDescription>
        </Alert>

        {formError !== null ? (
          <Alert variant="destructive" className="mt-5" role="alert">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>{t("errors.genericTitle")}</AlertTitle>
            <AlertDescription>{errorText(formError)}</AlertDescription>
          </Alert>
        ) : null}

        {/* ── method chooser ── */}
        {stage === "choose" ? (
          <>
            <h2 className="mt-8 text-sm font-semibold tracking-wide text-primary uppercase">
              {t("complaint.chooseMethod")}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Card className="flex flex-col">
                <CardHeader className="gap-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Mic className="size-5 text-primary" aria-hidden />
                    {t("complaint.methodVoice")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t("complaint.methodVoiceHint")}</p>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button
                    className="w-full"
                    onClick={() => {
                      setMethod("VOICE");
                      setStage("voice");
                    }}
                  >
                    {t("complaint.selectMethod")}
                  </Button>
                </CardContent>
              </Card>

              <Card className="flex flex-col">
                <CardHeader className="gap-1">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="size-5 text-primary" aria-hidden />
                    {t("complaint.methodForm")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t("complaint.methodFormHint")}</p>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => {
                      setMethod("FORM");
                      setStage("form");
                    }}
                  >
                    {t("complaint.selectMethod")}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}

        {/* ── voice recording ── */}
        {stage === "voice" ? (
          <Card className="mt-6 max-w-2xl">
            <CardHeader className="gap-1">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Mic className="size-4 text-primary" aria-hidden />
                {t("complaint.voiceHeading")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("complaint.voiceIntro")}</p>
            </CardHeader>
            <CardContent className="space-y-5">
              {voiceNotice !== null ? (
                <Alert variant="destructive" role="alert">
                  <AlertTriangle className="size-4" aria-hidden />
                  <AlertDescription>{t(voiceNotice)}</AlertDescription>
                </Alert>
              ) : null}

              <div
                className="flex flex-col items-center gap-4 rounded-md border bg-secondary/40 p-6"
                aria-live="polite"
              >
                {recording ? (
                  <>
                    <span className="flex items-center gap-2 text-sm font-semibold text-destructive">
                      <span
                        className="size-2.5 animate-pulse rounded-full bg-destructive"
                        aria-hidden
                      />
                      {t("complaint.voiceRecording")}
                    </span>
                    <span className="stat-figure text-2xl">{seconds}s</span>
                    <Button type="button" size="lg" variant="destructive" onClick={stopRecording}>
                      <Square className="mr-1 size-4" aria-hidden />
                      {t("complaint.voiceStop")}
                    </Button>
                  </>
                ) : audioBlob === null ? (
                  <Button type="button" size="lg" onClick={() => void startRecording()}>
                    <Mic className="mr-1 size-4" aria-hidden />
                    {t("complaint.voiceStart")}
                  </Button>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                      <CheckCircle2 className="size-4" aria-hidden />
                      {t("complaint.voiceRecorded")}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {t("complaint.voiceDuration", { seconds })}
                    </p>
                    {audioUrl !== null ? (
                      // Native player: keyboard accessible and screen-reader friendly.
                      <audio controls src={audioUrl} className="w-full max-w-sm">
                        <track kind="captions" />
                      </audio>
                    ) : null}
                    <div className="flex flex-wrap justify-center gap-3">
                      <Button type="button" onClick={() => void transcribe()} disabled={busy}>
                        {busy ? (
                          <Loader2 className="mr-1 size-4 animate-spin" aria-hidden />
                        ) : (
                          <Play className="mr-1 size-4" aria-hidden />
                        )}
                        {busy ? t("complaint.voiceTranscribing") : t("complaint.voiceTranscribe")}
                      </Button>
                      <Button type="button" variant="outline" onClick={discardRecording}>
                        <RotateCcw className="mr-1 size-4" aria-hidden />
                        {t("complaint.voiceDiscard")}
                      </Button>
                    </div>
                  </>
                )}
              </div>

              <Button type="button" variant="ghost" onClick={reset}>
                {t("complaint.changeMethod")}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {/* ── transcript review, then the same location block ── */}
        {stage === "transcript" || stage === "form" ? (
          <form
            noValidate
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <fieldset disabled={busy} className="space-y-8">
              {stage === "transcript" ? (
                <Alert>
                  <Info className="size-4" aria-hidden />
                  <AlertTitle>{t("complaint.transcriptHeading")}</AlertTitle>
                  <AlertDescription>
                    {t("complaint.transcriptIntro")}
                    <span className="mt-1 block text-xs">
                      {t("complaint.transcriptDetectedLanguage", {
                        language: languageLabel(detectedLanguage),
                      })}
                      {rawTranscript.trim() !== form.description.trim()
                        ? ` · ${t("complaint.transcriptEdited")}`
                        : ""}
                    </span>
                  </AlertDescription>
                </Alert>
              ) : null}

              <section aria-labelledby={`${uid}-details`}>
                <h2
                  id={`${uid}-details`}
                  className="text-sm font-semibold tracking-wide text-primary uppercase"
                >
                  {t("complaint.sectionDetails")}
                </h2>
                <Separator className="mt-2 mb-4" />
                <div className="space-y-4">
                  <Field
                    id={`${uid}-title`}
                    label={t("complaint.title_")}
                    hint={t("complaint.titleHint")}
                    error={fieldError("title")}
                    required
                  >
                    {(props) => (
                      <Input
                        {...props}
                        maxLength={150}
                        value={form.title}
                        onChange={(e) => set("title", e.target.value)}
                      />
                    )}
                  </Field>
                  <Field
                    id={`${uid}-description`}
                    label={t("complaint.description")}
                    hint={t("complaint.descriptionHint")}
                    error={fieldError("description")}
                    required
                  >
                    {(props) => (
                      <Textarea
                        {...props}
                        rows={7}
                        maxLength={5000}
                        value={form.description}
                        onChange={(e) => set("description", e.target.value)}
                      />
                    )}
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    {t("complaint.descriptionCounter", { count: form.description.length })}
                  </p>
                </div>
              </section>

              {evidenceBlock}
              {locationBlock}
              {duplicateBlock}
              {submitButton}
            </fieldset>
          </form>
        ) : null}
      </div>
    </CitizenShell>
  );
}
