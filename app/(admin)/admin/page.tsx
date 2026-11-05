import type { Metadata } from "next";
import { getActor } from "@/modules/auth/service";
import { listUsers, listVans } from "@/modules/users/service";
import { listAuditLogs } from "@/modules/audit/service";
import { getPricingForCity } from "@/modules/payments/service";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const actor = await getActor();
  if (!actor || actor.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-[-.03em]">Admin</h1>
        <p className="mt-1.5 text-sm text-muted">Sign in as an admin.</p>
      </div>
    );
  }

  const users = await listUsers(actor).catch(() => []);
  const vans = await listVans(actor).catch(() => []);
  const logs = await listAuditLogs(20).catch(() => []);
  const pricing = await getPricingForCity("Bengaluru").catch(() => null);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-.03em]">Admin</h1>
      <p className="mt-1.5 text-sm text-muted">User, van, pricing, and audit management.</p>

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">Users ({users.length})</h2>
        {users.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No users yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {users.map((u) => (
              <li key={u.id} className="border-t border-line pt-2 text-sm first:border-0 first:pt-0">
                <span className="font-semibold">{u.fullName || u.id.slice(0, 8)}</span>
                <span className="ml-2 rounded-full bg-accent-softer px-2 py-0.5 text-[11px] font-bold text-accent-deep">{u.role}</span>
                <span className="ml-2 text-xs font-mono text-muted">{u.id.slice(0, 8)}…</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">Fleet ({vans.length})</h2>
        {vans.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No vans configured.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {vans.map((v) => (
              <li key={v.id} className="border-t border-line pt-2 text-sm first:border-0 first:pt-0">
                <span className="font-semibold">{v.code}</span>
                <span className="ml-2 text-muted">{v.status} · {v.city}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">Pricing — Bengaluru</h2>
        <p className="mt-1 text-sm text-muted">
          {pricing ? `Base ₹${(pricing.baseFeePaise / 100).toFixed(0)} + ₹${(pricing.perKwhPaise / 100).toFixed(0)}/kWh` : "No rule yet — booking defaults apply (₹199 + ₹18/kWh)."}
        </p>
        <p className="mt-1 text-xs text-muted">Manage via <code>POST /api/v1/admin/pricing</code>.</p>
      </div>

      <div className="mt-6 rounded-shell border border-line bg-surface p-6">
        <h2 className="font-semibold">Audit log (latest)</h2>
        {logs.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No audit events yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {logs.map((l) => (
              <li key={l.id} className="border-t border-line pt-2 text-sm first:border-0 first:pt-0">
                <span className="font-mono text-xs">{l.action}</span>
                <span className="ml-2 text-xs text-muted">{l.resourceType}{l.resourceId ? ` · ${l.resourceId.slice(0, 8)}` : ""}</span>
                <span className="ml-2 text-xs text-muted">{l.createdAt.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
