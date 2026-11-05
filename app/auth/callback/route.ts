import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getProfile } from "@/modules/auth/service";

/**
 * OAuth/email-confirmation callback.
 * Exchanges `?code=` for a session and redirects to the role home.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const profile = await getProfile(user.id);
        const home =
          profile?.role === "driver"
            ? "/driver"
            : profile?.role === "dispatcher"
              ? "/ops"
              : profile?.role === "admin"
                ? "/admin"
                : "/customer";
        return NextResponse.redirect(`${origin}${next !== "/" ? next : home}`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in`);
}
