import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { listMyBookings } from "@/modules/bookings/service";
import { getActor } from "@/modules/auth/service";

export default async function CustomerPage() {
  const actor = await getActor();
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { items, nextCursor } = actor ? await listMyBookings(actor, undefined, 20) : { items: [], nextCursor: null };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-.03em]">Namaste, {user?.email?.split("@")[0]}</h1>
      <p className="mt-1.5 text-sm text-muted">Your active request and recent bookings.</p>

      <div className="mt-6">
        <Link
          href="/customer/bookings/new"
          className="inline-flex min-h-[46px] items-center rounded-full bg-accent px-5 text-sm font-semibold text-white"
        >
          Request a charge
        </Link>
      </div>

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">Active request</h2>
        {items.length === 0 ? (
          <p className="mt-1 text-sm text-muted">
            No active booking. When you request a charge it will appear here.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {items.map((b) => (
              <li key={b.id} className="flex items-center gap-3 border-t border-line pt-3">
                <span className="text-sm font-semibold">{b.reference}</span>
                <span className="rounded-full bg-accent-softer px-2.5 py-1 text-[11px] font-bold text-accent-deep">
                  {b.status}
                </span>
                <span className="ml-auto text-sm text-muted">{b.address}</span>
                <Link href={`/customer/bookings/${b.id}`} className="text-sm font-semibold text-accent hover:underline">
                  View
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">History</h2>
        <p className="mt-1 text-sm text-muted">
          {items.length === 0 ? "No past bookings yet." : `${items.length} booking(s) shown.`}
          {nextCursor && " More available via pagination."}
        </p>
      </div>
    </div>
  );
}
