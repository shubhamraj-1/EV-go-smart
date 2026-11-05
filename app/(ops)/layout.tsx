import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/blocks/app-shell";
import { getActor } from "@/modules/auth/service";

export default async function OpsLayout({ children }: Readonly<{ children: ReactNode }>) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  if (actor.role !== "dispatcher" && actor.role !== "admin") {
    redirect(actor.role === "customer" ? "/customer" : "/driver");
  }
  return <AppShell title="Dispatch">{children}</AppShell>;
}
