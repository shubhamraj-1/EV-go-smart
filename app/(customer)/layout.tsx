import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/blocks/app-shell";
import { getActor } from "@/modules/auth/service";

export default async function CustomerLayout({ children }: Readonly<{ children: ReactNode }>) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  if (actor.role !== "customer" && actor.role !== "admin") {
    redirect(actor.role === "driver" ? "/driver" : actor.role === "dispatcher" ? "/ops" : "/admin");
  }
  return <AppShell title="Customer">{children}</AppShell>;
}
