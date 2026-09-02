// Client-side wrappers to call the separate Express Backend running on Port 4000
const BASE_URL = "http://localhost:4000/api";

export async function adminLogin(data: any) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include", // capture HttpOnly cookie
    });
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 423) return { ok: false, error: "account_locked", lockedUntil: json.lockedUntil };
        return { ok: false, error: json.error || "invalid_credentials" };
    }
    return { ok: true, admin: json.admin };
}

export async function adminLogout() {
    await fetch(`${BASE_URL}/auth/logout`, { method: "POST", credentials: "include" });
    return { ok: true };
}

export async function getAdminProfile() {
    const res = await fetch(`${BASE_URL}/auth/me`, { method: "GET", credentials: "include" });
    if (!res.ok) return { ok: false };
    const json = await res.json();
    return { ok: true, admin: json.admin };
}

export async function getAdminQueue() {
    const res = await fetch(`${BASE_URL}/admin/me/queue`, { method: "GET", credentials: "include" });
    if (!res.ok) return { ok: false, error: "failed" };
    const json = await res.json();
    return { ok: true, grievances: json.grievances };
}

export async function getAdminSummary() {
    const res = await fetch(`${BASE_URL}/admin/me/summary`, { method: "GET", credentials: "include" });
    if (!res.ok) return { ok: false, error: "failed" };
    const json = await res.json();
    return { ok: true, summary: json.summary };
}
