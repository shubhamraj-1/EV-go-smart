import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

const service = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anon = () =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

const stamp = Date.now();
const email = `auth-test+${stamp}@test.local`;
let userId: string | null = null;

async function cleanup() {
  if (!userId) return;
  await service.auth.admin.deleteUser(userId);
  userId = null;
}

beforeAll(async () => {
  const { data } = await service.auth.admin.listUsers();
  await Promise.all(
    (data?.users ?? [])
      .filter((u) => u.email === email)
      .map((u) => service.auth.admin.deleteUser(u.id)),
  );
}, 30_000);

afterAll(async () => {
  await cleanup();
});

describe("profiles trigger", () => {
  it("creates a customer profile on sign-up", async () => {
    const { data, error } = await anon().auth.signUp({
      email,
      password: "TestPass123456",
      options: { data: { full_name: "Auth Test" } },
    });
    expect(error).toBeNull();
    expect(data.user?.id).toBeTruthy();

    userId = data.user!.id;

    // Trigger is async — poll briefly.
    let profile: { role: string } | null = null;
    for (let i = 0; i < 10; i++) {
      const { data: row } = await service
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
      if (row) {
        profile = row as { role: string };
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(profile?.role).toBe("customer");
  }, 30_000);

  it("signs in and reads own profile via RLS", async () => {
    const client = anon();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: "TestPass123456",
    });
    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();

    const { data: rows, error: readError } = await client
      .from("profiles")
      .select("id, role")
      .eq("id", userId!);
    expect(readError).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows![0]?.role).toBe("customer");
  });

  it("blocks role escalation via RLS", async () => {
    const client = anon();
    await client.auth.signInWithPassword({ email, password: "TestPass123456" });

    const { error } = await client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", userId!);
    expect(error).not.toBeNull();

    const { data } = await service
      .from("profiles")
      .select("role")
      .eq("id", userId!)
      .single();
    expect((data as { role: string }).role).toBe("customer");
  });

  it("rejects wrong password", async () => {
    const { error } = await anon().auth.signInWithPassword({
      email,
      password: "WrongPass123456",
    });
    expect(error).not.toBeNull();
  });
});
