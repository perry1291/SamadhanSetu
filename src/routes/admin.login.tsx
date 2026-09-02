import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogIn, Loader2, AlertTriangle, ShieldCheck } from "lucide-react";
import { CitizenShell } from "@/components/gov/citizen-shell"; // We borrow shell for aesthetics
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { adminLogin } from "@/lib/admin-api";

export const Route = createFileRoute("/admin/login")({
    component: AdminLoginPage,
});

function AdminLoginPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [lockout, setLockout] = useState<Date | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErrorMsg("");
        setLockout(null);
        setBusy(true);

        try {
            const res = await adminLogin({ email, password });

            if (!res.ok) {
                if (res.error === "account_locked") {
                    setLockout(new Date(res.lockedUntil));
                    setErrorMsg(`Account locked until ${new Date(res.lockedUntil).toLocaleTimeString()}`);
                } else {
                    setErrorMsg(res.error || "Invalid login credentials");
                }
                return;
            }

            // Success!
            // The HttpOnly JWT cookie is now set securely
            navigate({ to: "/admin" }); // Send to the queue dashboard
        } catch (err) {
            setErrorMsg("Network error connecting to the secure Admin backend.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <CitizenShell>
            <div className="mx-auto max-w-lg px-4 py-10 sm:py-14">
                <h1 className="font-serif text-2xl font-bold sm:text-3xl text-center">Grievance Route Control</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-center">
                    Secure Portal: Department Administrator & Nodal Officer Access Only
                </p>

                {errorMsg && (
                    <Alert variant="destructive" className="mt-6">
                        <AlertTriangle className="size-4" aria-hidden />
                        <AlertTitle>Authentication Failed</AlertTitle>
                        <AlertDescription>{errorMsg}</AlertDescription>
                    </Alert>
                )}

                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <LogIn className="size-4 text-primary" />
                            Secure Login
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="admin-email">Department Email</Label>
                                <Input
                                    id="admin-email"
                                    type="email"
                                    required
                                    placeholder="name.dept@gov.test"
                                    value={email}
                                    disabled={busy || !!lockout}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="admin-pass">Password</Label>
                                <Input
                                    id="admin-pass"
                                    type="password"
                                    required
                                    placeholder="••••••••"
                                    value={password}
                                    disabled={busy || !!lockout}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>

                            <Button type="submit" size="lg" className="w-full" disabled={busy || !!lockout}>
                                {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                                {busy ? "Authenticating..." : "Enter Portal"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Alert className="mt-5 bg-muted">
                    <ShieldCheck className="size-4 text-green-700" />
                    <AlertDescription className="text-xs text-muted-foreground">
                        This system logs IPs and utilizes rate-limiting to prevent brute force intrusions. Unauthorized access constitutes a federal cyber offense.
                    </AlertDescription>
                </Alert>
            </div>
        </CitizenShell>
    );
}
