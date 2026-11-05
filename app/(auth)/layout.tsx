import type { ReactNode } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Container className="flex items-center py-6">
        <Link href="/" aria-label="EVgoSmart home">
          <Logo />
        </Link>
      </Container>
      <div className="grid flex-1 place-items-center px-4 pb-16">
        <div className="w-full max-w-md rounded-shell border border-line bg-surface p-7 shadow-float max-sm:p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
