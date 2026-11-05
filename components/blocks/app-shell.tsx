import type { ReactNode } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { createServerSupabase } from "@/lib/supabase/server";
import { getProfile } from "@/modules/auth/service";
import { SignOutButton } from "./sign-out-button";

const ROLE_HOME: Record<string, string> = {
  customer: "/customer",
  driver: "/driver",
  dispatcher: "/ops",
  admin: "/admin",
};

export async function AppShell({
  children,
  title,
}: Readonly<{ children: ReactNode; title: string }>) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user ? await getProfile(user.id) : null;

  const home = profile ? (ROLE_HOME[profile.role] ?? "/") : "/";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <Container className="flex items-center gap-4 py-4">
          <Link href={home} aria-label="EVgoSmart home">
            <Logo size="sm" />
          </Link>
          <span className="text-sm font-semibold text-muted">{title}</span>
          <span className="ml-auto flex items-center gap-3">
            {profile && (
              <span className="text-sm text-muted">
                {profile.fullName} · {profile.role}
              </span>
            )}
            <SignOutButton />
          </span>
        </Container>
      </header>
      <Container className="flex-1 py-8">{children}</Container>
    </div>
  );
}
