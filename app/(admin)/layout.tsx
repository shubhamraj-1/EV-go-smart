import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/blocks/app-shell";
import { getActor } from "@/modules/auth/service";

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  if (actor.role !== "admin") {
    redirect(actor.role === "customer" ? "/customer" : actor.role === "driver" ? "/driver" : "/ops");
  }
  return <AppShell title="Admin">{children}</AppShell>;
}
