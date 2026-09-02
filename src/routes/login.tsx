/**
 * Citizen login — mobile number + 6-digit MPIN.
 *
 * Consistent with the registration page: same shell, same `Field`-style label /
 * hint / error wiring, same government visual language, all text from the shared
 * i18n resources.
 *
 * The MPIN is held in component state only for the duration of the request and
 * cleared immediately afterwards. No token is stored client-side — the session
 * arrives as an HttpOnly cookie the browser cannot read.
 */
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AlertTriangle, Eye, EyeOff, Info, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { CitizenShell } from "@/components/gov/citizen-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/i18n/use-translation";
import type { TranslationKey } from "@/i18n/translations";
import { loginFn } from "@/lib/auth-api";
import { loginSchema, type LoginFormValues } from "@/lib/validation/login";
import { toFieldErrors, type ErrorCode } from "@/lib/validation/registration";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Citizen Login — SamadhanSetu" },
      {
        name: "description",
        content:
          "Sign in to SamadhanSetu with your registered mobile number and MPIN to file and track grievances.",
      },
      // Authentication page; keep it out of search indexes.
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

/** Local copy of the registration page's field wrapper, same a11y contract. */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    "aria-required": true;
  }) => ReactNode;
}) {
  const hintId = hint !== undefined ? `${id}-hint` : undefined;
  const errorId = error !== undefined ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
        <span className="ml-0.5 text-destructive" aria-hidden>
          *
        </span>
      </Label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error !== undefined ? true : undefined,
        "aria-required": true,
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

const EMPTY: LoginFormValues = { mobile: "", mpin: "" };

function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const uid = useId();

  const [form, setForm] = useState<LoginFormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, ErrorCode>>({});
  const [formError, setFormError] = useState<ErrorCode | null>(null);
  const [lockoutMinutes, setLockoutMinutes] = useState<number | null>(null);
  const [showMpin, setShowMpin] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = t("login.metaTitle");
  }, [t]);

  const errorText = (errorCode: ErrorCode | undefined): string | undefined => {
    if (errorCode === undefined) return undefined;
    if (errorCode === "account_locked") {
      return t("errors.account_locked", { minutes: lockoutMinutes ?? 1 });
    }
    return t(`errors.${errorCode}` as TranslationKey);
  };

  function set<K extends keyof LoginFormValues>(key: K, value: LoginFormValues[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (previous[key] === undefined) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  async function submit() {
    setFormError(null);
    setFieldErrors({});
    setLockoutMinutes(null);

    // Shape check only, to save a round trip. The server re-validates and is
    // the only authority on whether the credentials are correct.
    const local = loginSchema.safeParse(form);
    if (!local.success) {
      setFieldErrors(toFieldErrors(local.error));
      setFormError("invalid_credentials");
      return;
    }

    setBusy(true);
    try {
      const result = await loginFn({ data: form });
      if (!result.ok) {
        if (result.retryAfterSeconds !== undefined) {
          setLockoutMinutes(Math.max(1, Math.ceil(result.retryAfterSeconds / 60)));
        }
        setFormError(result.error);
        // Never leave the MPIN in memory after a failed attempt.
        setForm((previous) => ({ ...previous, mpin: "" }));
        return;
      }
      // Drop the MPIN before navigating.
      setForm(EMPTY);
      // invalidate() re-runs the root loader so the shell picks up the new
      // session and renders the signed-in navigation.
      await router.invalidate();
      // Straight to the task the citizen signed in to do, rather than back to
      // the public landing page.
      await router.navigate({ to: "/complaint" });
    } catch {
      setFormError("server_error");
      setForm((previous) => ({ ...previous, mpin: "" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CitizenShell>
      <div className="mx-auto max-w-lg px-4 py-10 sm:py-14">
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">{t("login.heading")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("login.intro")}</p>

        {formError !== null ? (
          <Alert variant="destructive" className="mt-6" role="alert">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>{t("errors.genericTitle")}</AlertTitle>
            <AlertDescription>{errorText(formError)}</AlertDescription>
          </Alert>
        ) : null}

        <Card className="mt-6">
          <CardHeader className="gap-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <LogIn className="size-4 text-primary" aria-hidden />
              {t("login.formHeading")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t("common.requiredNote")}</p>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <fieldset disabled={busy} className="space-y-5">
                <Field
                  id={`${uid}-mobile`}
                  label={t("login.mobile")}
                  hint={t("login.mobileHint")}
                  error={errorText(fieldErrors["mobile"])}
                >
                  {(props) => (
                    <div className="flex items-stretch">
                      <span
                        className="inline-flex items-center rounded-l-sm border border-r-0 border-input bg-muted px-2.5 text-sm text-muted-foreground"
                        aria-hidden
                      >
                        +91
                      </span>
                      <Input
                        {...props}
                        className="rounded-l-none"
                        inputMode="numeric"
                        autoComplete="username tel-national"
                        maxLength={10}
                        value={form.mobile}
                        onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))}
                      />
                    </div>
                  )}
                </Field>

                <Field
                  id={`${uid}-mpin`}
                  label={t("login.mpin")}
                  hint={t("login.mpinHint")}
                  error={errorText(fieldErrors["mpin"])}
                >
                  {(props) => (
                    <Input
                      {...props}
                      // Masked unless the citizen explicitly reveals it.
                      type={showMpin ? "text" : "password"}
                      inputMode="numeric"
                      autoComplete="current-password"
                      maxLength={6}
                      className="max-w-[12rem] text-center text-lg tracking-[0.5em]"
                      value={form.mpin}
                      onChange={(e) => set("mpin", e.target.value.replace(/\D/g, ""))}
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
                  {showMpin ? t("login.hideMpin") : t("login.showMpin")}
                </button>

                <Button
                  type="submit"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={busy || form.mobile.length !== 10 || form.mpin.length !== 6}
                >
                  {busy ? <Loader2 className="mr-1 size-4 animate-spin" aria-hidden /> : null}
                  {busy ? t("login.submitting") : t("login.submit")}
                </Button>
              </fieldset>
            </form>

            <Separator className="my-5" />

            {/* Forgot MPIN is intentionally non-functional and says so. */}
            <button
              type="button"
              onClick={() => setShowForgot((v) => !v)}
              aria-expanded={showForgot}
              className="text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t("login.forgotMpin")}
            </button>
            {showForgot ? (
              <Alert className="mt-3">
                <Info className="size-4" aria-hidden />
                <AlertTitle>{t("login.forgotMpinComingSoonTitle")}</AlertTitle>
                <AlertDescription>{t("login.forgotMpinComingSoonBody")}</AlertDescription>
              </Alert>
            ) : null}

            <p className="mt-5 text-sm text-muted-foreground">
              {t("login.noAccount")}{" "}
              <Link to="/register" className="font-medium text-primary hover:underline">
                {t("login.registerLink")}
              </Link>
            </p>
          </CardContent>
        </Card>

        <Alert className="mt-5">
          <ShieldCheck className="size-4" aria-hidden />
          <AlertDescription>{t("login.securityNote")}</AlertDescription>
        </Alert>

        <div className="mt-6">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">{t("login.backHome")}</Link>
          </Button>
        </div>
      </div>
    </CitizenShell>
  );
}
