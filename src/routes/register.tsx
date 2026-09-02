/**
 * Citizen registration — four-step government form.
 *
 *   details → otp → mpin → success
 *
 * Structure follows the reference portal's information hierarchy: a
 * "Registration / Sign Up Form" heading, an "Enter Details" section, an explicit
 * mandatory-field note, and a two-column desktop grid that collapses to a single
 * column on mobile.
 *
 * Every string comes from the i18n resources via `t()`. There are no inline
 * language conditionals and no hardcoded English in this component, so switching
 * language re-renders the whole page in Hindi without touching form state.
 *
 * All validation shown here is a convenience for the citizen. The server
 * re-validates every field independently and is the only authority.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { CitizenShell } from "@/components/gov/citizen-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/i18n/use-translation";
import type { TranslationKey } from "@/i18n/translations";
import { COUNTRY, districtsOf, statesForDisplay } from "@/lib/locations";
import {
  completeRegistrationFn,
  resendOtpFn,
  startRegistrationFn,
  verifyOtpFn,
} from "@/lib/registration-api";
import {
  GENDERS,
  registrationDetailsSchema,
  toFieldErrors,
  type ErrorCode,
  type Gender,
  type RegistrationFormValues,
} from "@/lib/validation/registration";
import type { OtpDeliveryStatus } from "@/lib/server/otp-provider.server";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Citizen Registration — SamadhanSetu" },
      {
        name: "description",
        content:
          "Register as a citizen on SamadhanSetu to file and track public service grievances.",
      },
      // Registration is a private transaction; keep it out of search indexes.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RegisterPage,
});

type Step = "details" | "otp" | "mpin" | "success";

const EMPTY_FORM: RegistrationFormValues = {
  fullName: "",
  gender: "",
  premise: "",
  subLocality: "",
  locality: "",
  country: COUNTRY.code,
  state: "",
  district: "",
  pincode: "",
  mobile: "",
  phone: "",
  email: "",
};

interface ChallengeState {
  challengeId: string;
  maskedMobile: string;
  otpExpiresAt: string;
  deliveryStatus: OtpDeliveryStatus;
  attemptsRemaining: number;
  resendsRemaining: number;
}

/* ────────────────────────── small presentational helpers ────────────────────────── */

/**
 * Wraps one control with its label, hint and error, wiring `htmlFor`,
 * `aria-describedby` and `aria-invalid` consistently. Centralising this is what
 * keeps every field accessible rather than relying on per-field discipline.
 */
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
  // Explicit `| undefined` because exactOptionalPropertyTypes distinguishes an
  // absent property from one explicitly set to undefined, and callers pass the
  // result of a lookup that may be undefined.
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
        {required ? (
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

const SELECT_CLASS =
  "h-9 w-full rounded-sm border border-input bg-background px-3 py-1 text-sm " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive";

function StepIndicator({ current }: { current: Step }) {
  const { t } = useTranslation();
  const steps: { key: Step; labelKey: TranslationKey }[] = [
    { key: "details", labelKey: "register.stepDetails" },
    { key: "otp", labelKey: "register.stepVerify" },
    { key: "mpin", labelKey: "register.stepMpin" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === current);
  const resolvedIndex = current === "success" ? steps.length : activeIndex;

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {steps.map((step, index) => {
        const done = index < resolvedIndex;
        const active = index === resolvedIndex;
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={
                "flex size-6 items-center justify-center rounded-full border text-xs font-semibold " +
                (done
                  ? "border-success bg-success text-success-foreground"
                  : active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground")
              }
              aria-hidden
            >
              {done ? "✓" : index + 1}
            </span>
            <span className={active ? "font-semibold text-foreground" : "text-muted-foreground"}>
              {t(step.labelKey)}
            </span>
            {index < steps.length - 1 ? (
              <span className="hidden h-px w-6 bg-border sm:inline-block" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ────────────────────────── page ────────────────────────── */

function RegisterPage() {
  const { t, locale } = useTranslation();
  const uid = useId();

  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState<RegistrationFormValues>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, ErrorCode>>({});
  const [formError, setFormError] = useState<ErrorCode | null>(null);
  const [busy, setBusy] = useState(false);

  const [challenge, setChallenge] = useState<ChallengeState | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [verificationToken, setVerificationToken] = useState<string | null>(null);

  const [mpin, setMpin] = useState("");
  const [confirmMpin, setConfirmMpin] = useState("");
  const [showMpin, setShowMpin] = useState(false);

  const [registeredMobile, setRegisteredMobile] = useState<string | null>(null);

  // Keep the tab title in the active language.
  useEffect(() => {
    document.title = t("register.metaTitle");
  }, [t]);

  const states = useMemo(() => statesForDisplay(locale), [locale]);
  const districts = useMemo(() => districtsOf(form.state), [form.state]);

  const set = <K extends keyof RegistrationFormValues>(
    key: K,
    value: RegistrationFormValues[K],
  ) => {
    setForm((previous) => {
      // Changing State invalidates the previously chosen District.
      if (key === "state") return { ...previous, state: value as string, district: "" };
      return { ...previous, [key]: value };
    });
    setFieldErrors((previous) => {
      if (previous[key as string] === undefined) return previous;
      const next = { ...previous };
      delete next[key as string];
      return next;
    });
  };

  /** Translates an error code; unknown codes fall back to a generic message. */
  const errorText = (errorCode: ErrorCode | undefined): string | undefined =>
    errorCode === undefined ? undefined : t(`errors.${errorCode}` as TranslationKey);

  const fieldError = (name: keyof RegistrationFormValues): string | undefined =>
    errorText(fieldErrors[name]);

  function resetMessages() {
    setFormError(null);
    setFieldErrors({});
  }

  /* ── step 1 ── */
  async function submitDetails() {
    resetMessages();

    // Local pre-check with the same schema the server uses, purely to save a
    // round trip. The server result always wins.
    const local = registrationDetailsSchema.safeParse(form);
    if (!local.success) {
      setFieldErrors(toFieldErrors(local.error));
      setFormError("registration_failed");
      return;
    }

    setBusy(true);
    try {
      const result = await startRegistrationFn({ data: form });
      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors !== undefined) setFieldErrors(result.fieldErrors);
        return;
      }
      setChallenge({
        challengeId: result.challengeId,
        maskedMobile: result.maskedMobile,
        otpExpiresAt: result.otpExpiresAt,
        deliveryStatus: result.deliveryStatus,
        attemptsRemaining: result.attemptsRemaining,
        resendsRemaining: result.resendsRemaining,
      });
      setOtpCode("");
      setStep("otp");
    } catch {
      setFormError("server_error");
    } finally {
      setBusy(false);
    }
  }

  /* ── step 2 ── */
  async function submitOtp() {
    if (challenge === null) return;
    resetMessages();
    setBusy(true);
    try {
      const result = await verifyOtpFn({
        data: { challengeId: challenge.challengeId, code: otpCode },
      });
      if (!result.ok) {
        setFormError(result.error);
        if (result.attemptsRemaining !== undefined) {
          setChallenge({ ...challenge, attemptsRemaining: result.attemptsRemaining });
        }
        return;
      }
      setVerificationToken(result.verificationToken);
      setMpin("");
      setConfirmMpin("");
      setStep("mpin");
    } catch {
      setFormError("server_error");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (challenge === null) return;
    resetMessages();
    setBusy(true);
    try {
      const result = await resendOtpFn({ data: { challengeId: challenge.challengeId } });
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setChallenge({
        ...challenge,
        otpExpiresAt: result.otpExpiresAt,
        deliveryStatus: result.deliveryStatus,
        resendsRemaining: result.resendsRemaining,
        attemptsRemaining: result.attemptsRemaining,
      });
      setOtpCode("");
    } catch {
      setFormError("server_error");
    } finally {
      setBusy(false);
    }
  }

  /* ── step 3 ── */
  async function submitMpin() {
    if (challenge === null || verificationToken === null) return;
    resetMessages();

    if (mpin !== confirmMpin) {
      setFieldErrors({ confirmMpin: "mpin_mismatch" });
      setFormError("mpin_mismatch");
      return;
    }

    setBusy(true);
    try {
      const result = await completeRegistrationFn({
        data: {
          challengeId: challenge.challengeId,
          verificationToken,
          mpin,
          confirmMpin,
        },
      });
      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors !== undefined) setFieldErrors(result.fieldErrors);
        return;
      }
      setRegisteredMobile(result.maskedMobile);
      // Clear the MPIN from component state as soon as it is no longer needed.
      setMpin("");
      setConfirmMpin("");
      setVerificationToken(null);
      setStep("success");
    } catch {
      setFormError("server_error");
    } finally {
      setBusy(false);
    }
  }

  const expiryText = useMemo(() => {
    if (challenge === null) return "";
    return new Date(challenge.otpExpiresAt).toLocaleTimeString(
      locale === "hi" ? "hi-IN" : "en-IN",
      { hour: "2-digit", minute: "2-digit" },
    );
  }, [challenge, locale]);

  /* ────────────────────────── success ────────────────────────── */

  if (step === "success") {
    return (
      <CitizenShell>
        <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
          <Card className="border-success/40">
            <CardContent className="p-6 text-center sm:p-8">
              <CheckCircle2 className="mx-auto size-14 text-success" aria-hidden />
              <h1 className="mt-4 font-serif text-2xl font-bold">{t("success.heading")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t("success.body")}</p>

              <div className="mt-6 rounded-md border bg-secondary/60 p-4 text-left">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("success.registeredMobile")}
                </p>
                <p className="stat-figure mt-1 text-lg">{registeredMobile}</p>
              </div>

              <div className="mt-4 rounded-md border p-4 text-left">
                <p className="text-sm font-semibold">{t("success.nextStepTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("success.nextStepBody")}</p>
              </div>

              {/* Stated explicitly: no provider was called, so nothing was sent. */}
              <p className="mt-4 text-xs text-muted-foreground">{t("success.noMessageNote")}</p>

              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button asChild>
                  <Link to="/login">{t("success.goToLogin")}</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">{t("success.backHome")}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </CitizenShell>
    );
  }

  /* ────────────────────────── steps 1–3 ────────────────────────── */

  return (
    <CitizenShell>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">{t("register.heading")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t("register.intro")}
        </p>

        <div className="mt-6">
          <StepIndicator current={step} />
        </div>

        {/* Error summary announced to assistive tech as soon as it appears. */}
        {formError !== null ? (
          <Alert variant="destructive" className="mt-6" role="alert">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>{t("errors.title")}</AlertTitle>
            <AlertDescription>{errorText(formError)}</AlertDescription>
          </Alert>
        ) : null}

        {/* ── STEP 1: details ── */}
        {step === "details" ? (
          <Card className="mt-6">
            <CardHeader className="gap-1">
              <CardTitle className="text-base sm:text-lg">{t("register.formHeading")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("common.requiredNote")}</p>
            </CardHeader>
            <CardContent>
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitDetails();
                }}
              >
                <fieldset disabled={busy} className="space-y-8">
                  {/* Applicant */}
                  <section aria-labelledby={`${uid}-applicant`}>
                    <h2
                      id={`${uid}-applicant`}
                      className="text-sm font-semibold tracking-wide text-primary uppercase"
                    >
                      {t("register.sectionApplicant")}
                    </h2>
                    <Separator className="mt-2 mb-4" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        id={`${uid}-fullName`}
                        label={t("register.fullName")}
                        hint={t("register.fullNameHint")}
                        error={fieldError("fullName")}
                        required
                      >
                        {(props) => (
                          <Input
                            {...props}
                            autoComplete="name"
                            maxLength={100}
                            value={form.fullName}
                            onChange={(e) => set("fullName", e.target.value)}
                          />
                        )}
                      </Field>

                      {/* Radio group in a fieldset so the question is announced. */}
                      <fieldset className="space-y-1.5">
                        <legend className="text-sm leading-none font-medium">
                          {t("register.gender")}
                          <span className="ml-0.5 text-destructive" aria-hidden>
                            *
                          </span>
                        </legend>
                        <div
                          className="flex flex-wrap gap-x-5 gap-y-2 pt-1.5"
                          aria-describedby={
                            fieldError("gender") !== undefined ? `${uid}-gender-error` : undefined
                          }
                        >
                          {GENDERS.map((value) => (
                            <label
                              key={value}
                              className="flex cursor-pointer items-center gap-2 text-sm"
                            >
                              <input
                                type="radio"
                                name="gender"
                                value={value}
                                checked={form.gender === value}
                                onChange={() => set("gender", value as Gender)}
                                className="size-4 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
                              />
                              {t(
                                value === "MALE"
                                  ? "register.genderMale"
                                  : value === "FEMALE"
                                    ? "register.genderFemale"
                                    : "register.genderTransgender",
                              )}
                            </label>
                          ))}
                        </div>
                        {fieldError("gender") !== undefined ? (
                          <p
                            id={`${uid}-gender-error`}
                            className="text-xs font-medium text-destructive"
                          >
                            {fieldError("gender")}
                          </p>
                        ) : null}
                      </fieldset>
                    </div>
                  </section>

                  {/* Address */}
                  <section aria-labelledby={`${uid}-address`}>
                    <h2
                      id={`${uid}-address`}
                      className="text-sm font-semibold tracking-wide text-primary uppercase"
                    >
                      {t("register.sectionAddress")}
                    </h2>
                    <Separator className="mt-2 mb-4" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        id={`${uid}-premise`}
                        label={t("register.premise")}
                        hint={t("register.premiseHint")}
                        error={fieldError("premise")}
                        required
                      >
                        {(props) => (
                          <Input
                            {...props}
                            autoComplete="address-line1"
                            maxLength={100}
                            value={form.premise}
                            onChange={(e) => set("premise", e.target.value)}
                          />
                        )}
                      </Field>

                      <Field
                        id={`${uid}-subLocality`}
                        label={`${t("register.subLocality")} (${t("common.optional")})`}
                        hint={t("register.subLocalityHint")}
                        error={fieldError("subLocality")}
                      >
                        {(props) => (
                          <Input
                            {...props}
                            autoComplete="address-line2"
                            maxLength={100}
                            value={form.subLocality}
                            onChange={(e) => set("subLocality", e.target.value)}
                          />
                        )}
                      </Field>

                      <Field
                        id={`${uid}-locality`}
                        label={t("register.locality")}
                        hint={t("register.localityHint")}
                        error={fieldError("locality")}
                        required
                      >
                        {(props) => (
                          <Input
                            {...props}
                            autoComplete="address-level2"
                            maxLength={100}
                            value={form.locality}
                            onChange={(e) => set("locality", e.target.value)}
                          />
                        )}
                      </Field>

                      <Field
                        id={`${uid}-country`}
                        label={t("register.country")}
                        error={fieldError("country")}
                        required
                      >
                        {(props) => (
                          <select {...props} className={SELECT_CLASS} value={COUNTRY.code} disabled>
                            <option value={COUNTRY.code}>
                              {locale === "hi" ? COUNTRY.nativeName : COUNTRY.name}
                            </option>
                          </select>
                        )}
                      </Field>

                      <Field
                        id={`${uid}-state`}
                        label={t("register.state")}
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
                        label={t("register.district")}
                        hint={
                          form.state === "" ? t("register.districtSelectStateFirst") : undefined
                        }
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

                      <Field
                        id={`${uid}-pincode`}
                        label={t("register.pincode")}
                        hint={t("register.pincodeHint")}
                        error={fieldError("pincode")}
                        required
                      >
                        {(props) => (
                          <Input
                            {...props}
                            inputMode="numeric"
                            autoComplete="postal-code"
                            maxLength={6}
                            value={form.pincode}
                            onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))}
                          />
                        )}
                      </Field>
                    </div>
                  </section>

                  {/* Contact */}
                  <section aria-labelledby={`${uid}-contact`}>
                    <h2
                      id={`${uid}-contact`}
                      className="text-sm font-semibold tracking-wide text-primary uppercase"
                    >
                      {t("register.sectionContact")}
                    </h2>
                    <Separator className="mt-2 mb-4" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        id={`${uid}-mobile`}
                        label={t("register.mobile")}
                        hint={t("register.mobileHint")}
                        error={fieldError("mobile")}
                        required
                      >
                        {(props) => (
                          <div className="flex items-stretch">
                            <span
                              className="inline-flex items-center rounded-l-sm border border-r-0 border-input bg-muted px-2.5 text-sm text-muted-foreground"
                              aria-hidden
                            >
                              {t("register.mobilePrefix")}
                            </span>
                            <Input
                              {...props}
                              className="rounded-l-none"
                              inputMode="numeric"
                              autoComplete="tel-national"
                              maxLength={10}
                              value={form.mobile}
                              onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))}
                            />
                          </div>
                        )}
                      </Field>

                      <Field
                        id={`${uid}-phone`}
                        label={`${t("register.phone")} (${t("common.optional")})`}
                        hint={t("register.phoneHint")}
                        error={fieldError("phone")}
                      >
                        {(props) => (
                          <Input
                            {...props}
                            inputMode="tel"
                            autoComplete="tel"
                            maxLength={20}
                            value={form.phone}
                            onChange={(e) => set("phone", e.target.value)}
                          />
                        )}
                      </Field>

                      <Field
                        id={`${uid}-email`}
                        label={`${t("register.email")} (${t("common.optional")})`}
                        hint={t("register.emailHint")}
                        error={fieldError("email")}
                      >
                        {(props) => (
                          <Input
                            {...props}
                            type="email"
                            autoComplete="email"
                            maxLength={254}
                            value={form.email}
                            onChange={(e) => set("email", e.target.value)}
                          />
                        )}
                      </Field>
                    </div>
                  </section>

                  <Alert>
                    <ShieldCheck className="size-4" aria-hidden />
                    <AlertDescription>{t("register.privacyNote")}</AlertDescription>
                  </Alert>

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" size="lg" disabled={busy}>
                      {busy ? <Loader2 className="mr-1 size-4 animate-spin" aria-hidden /> : null}
                      {busy ? t("register.submitting") : t("register.submitDetails")}
                    </Button>
                    <Button asChild type="button" variant="outline" size="lg">
                      <Link to="/">{t("common.cancel")}</Link>
                    </Button>
                  </div>
                </fieldset>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {/* ── STEP 2: OTP ── */}
        {step === "otp" && challenge !== null ? (
          <Card className="mt-6 max-w-xl">
            <CardHeader className="gap-1">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Smartphone className="size-4 text-primary" aria-hidden />
                {t("otp.heading")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Delivery status is reported truthfully — never "sent" unless it was. */}
              {challenge.deliveryStatus === "sent" ? (
                <p className="text-sm text-muted-foreground">
                  {t("otp.intro", { mobile: challenge.maskedMobile })}
                </p>
              ) : challenge.deliveryStatus === "development_server_log" ? (
                <Alert>
                  <Info className="size-4" aria-hidden />
                  <AlertTitle>{t("otp.devDeliveryTitle")}</AlertTitle>
                  <AlertDescription>{t("otp.devDeliveryBody")}</AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="size-4" aria-hidden />
                  <AlertTitle>{t("otp.providerNotConfiguredTitle")}</AlertTitle>
                  <AlertDescription>{t("otp.providerNotConfiguredBody")}</AlertDescription>
                </Alert>
              )}

              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitOtp();
                }}
              >
                <fieldset disabled={busy} className="space-y-4">
                  <Field
                    id={`${uid}-otp`}
                    label={t("otp.codeLabel")}
                    hint={t("otp.codeHint")}
                    required
                  >
                    {(props) => (
                      <Input
                        {...props}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        // Wide, centred, spaced: easy to read and tap on mobile.
                        className="max-w-[12rem] text-center text-lg tracking-[0.5em]"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                      />
                    )}
                  </Field>

                  <p className="text-xs text-muted-foreground">
                    {t("otp.expiresAt", { time: expiryText })}{" "}
                    {t("otp.attemptsRemaining", { count: challenge.attemptsRemaining })} ·{" "}
                    {t("otp.resendsRemaining", { count: challenge.resendsRemaining })}
                  </p>

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={busy || otpCode.length !== 6}>
                      {busy ? <Loader2 className="mr-1 size-4 animate-spin" aria-hidden /> : null}
                      {busy ? t("otp.verifying") : t("otp.verify")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void resend()}
                      disabled={busy || challenge.resendsRemaining <= 0}
                    >
                      {t("otp.resend")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        // Details are preserved so nothing is retyped.
                        resetMessages();
                        setStep("details");
                      }}
                    >
                      <ArrowLeft className="mr-1 size-4" aria-hidden />
                      {t("otp.changeMobile")}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {/* ── STEP 3: MPIN ── */}
        {step === "mpin" ? (
          <Card className="mt-6 max-w-xl">
            <CardHeader className="gap-1">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Lock className="size-4 text-primary" aria-hidden />
                {t("mpin.heading")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert>
                <CheckCircle2 className="size-4" aria-hidden />
                <AlertDescription>{t("otp.verified")}</AlertDescription>
              </Alert>

              <p className="text-sm text-muted-foreground">{t("mpin.intro")}</p>

              <div className="rounded-md border bg-secondary/50 p-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("mpin.rulesTitle")}
                </p>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                  <li>{t("mpin.ruleLength")}</li>
                  <li>{t("mpin.ruleNumeric")}</li>
                  <li>{t("mpin.ruleNotWeak")}</li>
                </ul>
              </div>

              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitMpin();
                }}
              >
                <fieldset disabled={busy} className="space-y-4">
                  <Field
                    id={`${uid}-mpin`}
                    label={t("mpin.create")}
                    hint={t("mpin.createHint")}
                    error={fieldError("mpin" as keyof RegistrationFormValues)}
                    required
                  >
                    {(props) => (
                      <Input
                        {...props}
                        // Masked by default; never rendered as plain text unless
                        // the citizen explicitly reveals it.
                        type={showMpin ? "text" : "password"}
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={6}
                        className="max-w-[12rem] text-center text-lg tracking-[0.5em]"
                        value={mpin}
                        onChange={(e) => setMpin(e.target.value.replace(/\D/g, ""))}
                      />
                    )}
                  </Field>

                  <Field
                    id={`${uid}-confirmMpin`}
                    label={t("mpin.confirm")}
                    hint={t("mpin.confirmHint")}
                    error={fieldError("confirmMpin" as keyof RegistrationFormValues)}
                    required
                  >
                    {(props) => (
                      <Input
                        {...props}
                        type={showMpin ? "text" : "password"}
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={6}
                        className="max-w-[12rem] text-center text-lg tracking-[0.5em]"
                        value={confirmMpin}
                        onChange={(e) => setConfirmMpin(e.target.value.replace(/\D/g, ""))}
                      />
                    )}
                  </Field>

                  <button
                    type="button"
                    onClick={() => setShowMpin((v) => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {showMpin ? (
                      <EyeOff className="size-3.5" aria-hidden />
                    ) : (
                      <Eye className="size-3.5" aria-hidden />
                    )}
                    {showMpin ? t("mpin.hide") : t("mpin.show")}
                  </button>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="submit"
                      size="lg"
                      disabled={busy || mpin.length !== 6 || confirmMpin.length !== 6}
                    >
                      {busy ? <Loader2 className="mr-1 size-4 animate-spin" aria-hidden /> : null}
                      {busy ? t("mpin.registering") : t("mpin.register")}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </CitizenShell>
  );
}
