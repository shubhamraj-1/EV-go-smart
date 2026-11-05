import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/blocks/app-shell";
import { getActor } from "@/modules/auth/service";

export default async function DriverLayout({ children }: Readonly<{ children: ReactNode }>) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  if (actor.role !== "driver" && actor.role !== "admin") {
    redirect(actor.role === "customer" ? "/customer" : "/ops");
  }
  return <AppShell title="Driver">{children}</AppShell>;
}
