import "server-only";

import { createServiceClient, createServerSupabase } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/db/schema";

export type { UserRole } from "@/lib/db/schema";
export type Actor = { userId: string; role: UserRole };

export const ROLE_HOME: Record<UserRole, string> = {
  customer: "/customer",
  driver: "/driver",
  dispatcher: "/ops",
  admin: "/admin",
};

/**
 * Returns the authenticated user + profile, or null if signed out.
 * Uses `auth.getUser()` (validates against the Auth server) — never
 * trusts client-supplied session data.
 */
export async function getActor(): Promise<Actor | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await getProfile(user.id);
  if (!profile) return null;

  return { userId: user.id, role: profile.role };
}

export async function requireSession(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    throw new Error("UNAUTHENTICATED");
  }
  return actor;
}

export async function requireRole(...roles: UserRole[]): Promise<Actor> {
  const actor = await requireSession();
  if (!roles.includes(actor.role)) {
    throw new Error("FORBIDDEN");
  }
  return actor;
}

/** Assert a customer can access a resource owned by `ownerId`. */
export function assertOwner(actor: Actor, ownerId: string): void {
  if (actor.userId !== ownerId) {
    throw new Error("FORBIDDEN");
  }
}

/** Get a profile by user id (service role — bypasses RLS, server-only). */
export async function getProfile(userId: string): Promise<Profile | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("id, role, full_name, phone, session_version, created_at, updated_at")
    .eq("id", userId)
    .single();

  if (error || !data) return null;

  const row = data as unknown as Record<string, unknown>;
  return {
    id: String(row.id),
    role: String(row.role) as UserRole,
    fullName: String(row.full_name ?? ""),
    phone: (row.phone as string | null) ?? null,
    sessionVersion: Number(row.session_version ?? 1),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}
