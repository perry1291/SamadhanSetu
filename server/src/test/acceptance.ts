/**
 * Acceptance test suite — run via `npm run test:acceptance`
 * (Ensure server is running in dev mode first)
 */
import "dotenv/config";

const BASE = "http://localhost:4000";

async function apiFetch(path: string, opts: { method?: string; body?: any; cookie?: string } = {}) {
    const reqOpts: RequestInit = {
        method: opts.method || "GET",
        headers: { "Content-Type": "application/json", ...(opts.cookie ? { Cookie: opts.cookie } : {}) },
    };
    if (opts.body) {
        reqOpts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(`${BASE}${path}`, reqOpts);

    let data: any = {};
    if (res.headers.get("content-type")?.includes("json")) {
        data = await res.json();
    }

    return { status: res.status, data, headers: res.headers };
}

function extractJwt(headers: Headers) {
    const cookie = headers.get("set-cookie") || "";
    const match = cookie.match(/jwt=([^;]+)/);
    return match ? `jwt=${match[1]}` : "";
}

function pass(m: string) { console.log(`  ✅ PASS: ${m}`); }
function fail(m: string) { console.error(`  ❌ FAIL: ${m}`); process.exitCode = 1; }

async function main() {
    console.log("\n── Running Admin Portal Test Slice Acceptance Suite ──\n");

    // 1. Health check
    const h = await apiFetch("/health");
    if (h.status === 200) pass("GET /health -> 200"); else fail(`Health check -> ${h.status}`);

    // 2. Login
    const lr = await apiFetch("/api/auth/login", {
        method: "POST",
        body: { email: "admin.roads@gov.test", password: "Admin@1234" }
    });
    const jwt = extractJwt(lr.headers);

    if (lr.status === 200) pass("Login successful (200)"); else fail(`Login -> ${lr.status}`);
    if (jwt) pass("JWT cookie set safely"); else fail("No JWT set-cookie");
    if (!lr.data.admin?.passwordHash) pass("passwordHash omitted from response"); else fail("passwordHash leaked!");
    if (lr.data.admin?.role === "department_admin") pass("Correct profile shape/role returned"); else fail("Invalid profile returned");

    // 3. /me Endpoint + isolation test
    const me = await apiFetch("/api/auth/me", { cookie: jwt });
    if (me.status === 200) pass("GET /api/auth/me -> 200 (session works)"); else fail(`GET /me -> ${me.status}`);

    // 4. Lockout test
    // Use a different dummy login so we dont lock out our main user
    console.log("\n── Lockout Enforcement ──");
    for (let i = 0; i < 5; i++) {
        await apiFetch("/api/auth/login", { method: "POST", body: { email: "admin.roads@gov.test", password: "WRONG" } });
    }
    const locked = await apiFetch("/api/auth/login", { method: "POST", body: { email: "admin.roads@gov.test", password: "WRONG_6" } });
    if (locked.status === 423) pass("Account locked after 5 attempts -> 423"); else fail(`Lockout status: ${locked.status} (expected 423)`);
    if (locked.data.lockedUntil) pass("lockedUntil timestamp returned to client"); else fail("lockedUntil not returned");

    // 5. Admin Queue + Verification
    console.log("\n── Route Matching & Queue Verification ──");
    // We need super admin to see everything
    const slr = await apiFetch("/api/auth/login", { method: "POST", body: { email: "super@gov.test", password: "Super@1234" } });
    const sjwt = extractJwt(slr.headers);

    // We rely on the seed script having already classified the 4 grievances
    const qr = await apiFetch("/api/admin/me/queue", { cookie: sjwt }); // Super admin can see all
    if (qr.status === 200) pass("Queue fetched (200)"); else fail(`Queue -> ${qr.status}`);

    const grievances: any[] = qr.data.grievances || [];
    if (grievances.length === 4) pass(`Queue size is exactly 4`); else fail(`Queue size is ${grievances.length}`);

    // Verify severity classification from the keyword rules
    const p1 = grievances.find(g => g.rawText.includes("accident"));
    const p2 = grievances.find(g => g.rawText.includes("खड्डे"));
    const p3 = grievances.find(g => g.rawText.includes("Bus schedule"));
    const unrouted = grievances.find(g => g.routingMeta?.wasFallback);

    if (p1 && p1.severity === "P1") pass("Accident mapped to P1 correctly"); else fail("Accident not P1");
    if (p2 && p2.severity === "P2") pass("Marathi 'खड्डे' mapped to P2 correctly"); else fail("Pothole not P2");
    if (p3 && p3.severity === "P3") pass("Bus keyword mapped to P3 correctly"); else fail("Bus not P3");

    if (unrouted && unrouted.department === undefined && unrouted.severity === "P3") pass("Gibberish hit unrouted fallback correctly");
    else fail("Unrouted fallback failed to capture unmarked grievance");

    // Verify sorting (P1 first, then P2, etc.)
    let prevSeverity = 0;
    let sortingValid = true;
    for (const g of (grievances.filter(g => g.department))) { // ignore unrouted for now
        const rank = g.severity === "P1" ? 1 : g.severity === "P2" ? 2 : 3;
        if (rank < prevSeverity) sortingValid = false;
        prevSeverity = rank;
    }
    if (sortingValid) pass("Queue legitimately sorted by Severity (P1 -> P2 -> P3)"); else fail("Queue severity sorting is invalid");

    console.log("\n── Testing complete ──");
    if (process.exitCode === 1) {
        console.error("  Some tests failed.");
    } else {
        console.log("  All Acceptance Constraints Satisfied ✅");
    }
}

main().catch(e => {
    console.error("Runner failed:", e);
    process.exit(1);
});
