import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const service = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Create a supabase SSR client that captures auth cookies into a jar we can
 * replay as a `Cookie` header on API requests. The API handlers read cookies
 * through `createServerSupabase()` (`getAll`/`setAll`), so a bearer token
 * alone yields `401 UNAUTHENTICATED`.
 */
async function createConfirmedUser(email: string): Promise<{
  client: SupabaseClient;
  cookieHeader: () => string;
  mergeSetCookie: (header: string) => void;
}> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: "TestPass123456",
    email_confirm: true,
    user_metadata: { full_name: email.split("@")[0] },
  });
  if (error) throw error;
  const userId = data.user.id;
  // Trigger is async; ensure the profile exists before proceeding.
  for (let i = 0; i < 20; i++) {
    const { data: profile } = await service
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .single();
    if (profile) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  const jar = new Map<string, string>();
  const client = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll() {
        return Array.from(jar.entries()).map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });

  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: "TestPass123456",
  });
  if (signInError) throw signInError;

  const cookieHeader = () =>
    Array.from(jar.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

  const mergeSetCookie = (setCookie: string) => {
    for (const c of parseCookieHeader(setCookie)) {
      if (c.value) jar.set(c.name, c.value);
      else jar.delete(c.name);
    }
  };

  return { client, cookieHeader, mergeSetCookie };
}

const stamp = Date.now();
const emailA = `phase1-a+${stamp}@test.local`;
const emailB = `phase1-b+${stamp}@test.local`;
/** Stable 5-digit suffix for license plates (DB max 12 chars). */
const ID_EXTRA = String(stamp).slice(-5);

type TestUser = Awaited<ReturnType<typeof createConfirmedUser>>;

let userA!: TestUser;
let userB!: TestUser;
let vehicleAId = "";
let bookingAId = "";

/** JSON response envelope used by the API routes. */
type ApiEnvelope = Record<string, unknown> & {
  vehicle?: { id: string; make: string; model: string };
  booking?: { id: string; status: string; estimatedTotalPaise: number };
  error?: { code: string; message: string };
  items?: unknown[];
  nextCursor?: string | null;
};

/**
 * Fetch with a `Cookie` header built from the client's cookie jar.
 */
async function authFetch(
  user: TestUser,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: ApiEnvelope }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };
  const cookie = user.cookieHeader();
  if (cookie) headers["Cookie"] = cookie;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  // Capture any Set-Cookie the proxy/session refresh may send and merge
  // it back into the jar for the next call.
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) user.mergeSetCookie(setCookie);

  let body: ApiEnvelope = {};
  try {
    body = (await res.json()) as ApiEnvelope;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

beforeAll(async () => {
  userA = await createConfirmedUser(emailA);
  userB = await createConfirmedUser(emailB);
}, 60_000);

afterAll(async () => {
  const { data } = await service.auth.admin.listUsers();
  await Promise.all(
    (data?.users ?? [])
      .filter((u) => u.email === emailA || u.email === emailB)
      .map((u) => service.auth.admin.deleteUser(u.id)),
  );
});

describe("vehicles CRUD", () => {
  it("creates a vehicle for the owner", async () => {
    const { status, body } = await authFetch(userA, "/api/v1/vehicles", {
      method: "POST",
      body: JSON.stringify({
        make: "Tata",
        model: "Nexon EV",
        year: 2023,
        connectorType: "CCS2",
        batteryKwh: 40,
        licensePlate: `KA01EV${ID_EXTRA}`,
      }),
    });
    expect(status).toBe(201);
    expect(body.vehicle?.make).toBe("Tata");
    vehicleAId = body.vehicle?.id ?? "";
  });

  it("rejects duplicates plates per user", async () => {
    const { status, body } = await authFetch(userA, "/api/v1/vehicles", {
      method: "POST",
      body: JSON.stringify({
        make: "Tata",
        model: "Nexon EV",
        year: 2023,
        connectorType: "CCS2",
        batteryKwh: 40,
        licensePlate: `KA01EV${ID_EXTRA}`,
      }),
    });
    expect(status).toBe(409);
    expect(body.error?.code).toBe("VEHICLE_EXISTS");
  });

  it("does not leak another user's vehicle (IDOR 404)", async () => {
    const { status } = await authFetch(userB, `/api/v1/vehicles/${vehicleAId}`);
    expect(status).toBe(404);
  });

  it("updates the owner's vehicle", async () => {
    const { status, body } = await authFetch(userA, `/api/v1/vehicles/${vehicleAId}`, {
      method: "PATCH",
      body: JSON.stringify({ model: "Nexon EV Max" }),
    });
    expect(status).toBe(200);
    expect(body.vehicle?.model).toBe("Nexon EV Max");
  });

  it("deletes the owner's vehicle", async () => {
    const { status } = await authFetch(userA, `/api/v1/vehicles/${vehicleAId}`, {
      method: "DELETE",
    });
    expect(status).toBe(200);
    const again = await authFetch(userA, `/api/v1/vehicles/${vehicleAId}`);
    expect(again.status).toBe(404);
  });
});

describe("bookings", () => {
  it("requires an idempotency key", async () => {
    // Re-create the vehicle for booking tests.
    const created = await authFetch(userA, "/api/v1/vehicles", {
      method: "POST",
      body: JSON.stringify({
        make: "Tata",
        model: "Nexon EV",
        year: 2023,
        connectorType: "CCS2",
        batteryKwh: 40,
        licensePlate: `KA01EV${ID_EXTRA}B`,
      }),
    });
    vehicleAId = created.body.vehicle?.id ?? "";

    const { status, body } = await authFetch(userA, "/api/v1/bookings", {
      method: "POST",
      body: JSON.stringify({
        vehicleId: vehicleAId,
        lat: 12.9716,
        lng: 77.5946,
        address: "12th Main, Indiranagar",
        batteryPercent: 20,
        connectorType: "CCS2",
      }),
    });
    expect(status).toBe(400);
    expect(body.error?.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("creates a booking with an idempotency key", async () => {
    const { status, body } = await authFetch(userA, "/api/v1/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        vehicleId: vehicleAId,
        lat: 12.9716,
        lng: 77.5946,
        address: "12th Main, Indiranagar",
        batteryPercent: 20,
        connectorType: "CCS2",
      }),
    });
    expect(status).toBe(201);
    // Phase 2A: creation attempts auto-dispatch; with no vans configured the
    // booking stays `requested` (with vans present it becomes `assigned`).
    expect(["requested", "assigned"]).toContain(body.booking?.status);
    expect(body.booking?.estimatedTotalPaise).toBe(63_100);
    bookingAId = body.booking?.id ?? "";
  });

  it("returns the original booking for a retried key", async () => {
    const key = crypto.randomUUID();
    const payload = JSON.stringify({
      vehicleId: vehicleAId,
      lat: 12.9716,
      lng: 77.5946,
      address: "12th Main, Indiranagar",
      batteryPercent: 20,
      connectorType: "CCS2",
    });
    const first = await authFetch(userA, "/api/v1/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: payload,
    });
    const second = await authFetch(userA, "/api/v1/bookings", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: payload,
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.booking?.id).toBeTruthy();
    expect(second.body.booking?.id).toBe(first.body.booking?.id);
  });

  it("does not leak another user's booking (IDOR 404)", async () => {
    const { status } = await authFetch(userB, `/api/v1/bookings/${bookingAId}`);
    expect(status).toBe(404);
  });

  it("lists only own bookings and paginates with a cursor", async () => {
    const page1 = await authFetch(userA, "/api/v1/bookings?limit=1");
    expect(page1.status).toBe(200);
    expect(page1.body.items?.length ?? 0).toBeGreaterThan(0);
    const next = page1.body.nextCursor;

    const page2 = await authFetch(
      userA,
      `/api/v1/bookings?limit=1&cursor=${encodeURIComponent(next ?? "")}`,
    );
    expect(page2.status).toBe(200);
    // History is cursor-based; second page can be empty when fewer than 2 rows exist.
    expect(Array.isArray(page2.body.items)).toBe(true);

    // Another user's list is empty.
    const other = await authFetch(userB, "/api/v1/bookings");
    expect(other.body.items).toEqual([]);
  });
});
