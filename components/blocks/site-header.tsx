import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { getActor, ROLE_HOME } from "@/modules/auth/service";

const navLinks = [
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

export async function SiteHeader() {
  const actor = await getActor();

  return (
    <header>
      <Container className="flex items-center gap-[34px] py-[26px] max-md:py-5">
        <Logo />

        <nav aria-label="Main" className="ml-auto hidden items-center gap-7 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted transition-colors duration-150 hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {actor ? (
          <Button asChild size="sm" className="ml-1.5 max-md:ml-auto">
            <Link href={ROLE_HOME[actor.role]}>
              Open dashboard
              <ArrowRight className="size-[15px]" strokeWidth={2} aria-hidden />
            </Link>
          </Button>
        ) : (
          <>
            <Link
              href="/sign-in"
              className="text-sm font-medium text-muted transition-colors duration-150 hover:text-ink max-md:ml-auto"
            >
              Sign in
            </Link>
            <Button asChild size="sm" className="ml-1.5">
              <Link href="/sign-up">
                Get help now
                <ArrowRight className="size-[15px]" strokeWidth={2} aria-hidden />
              </Link>
            </Button>
          </>
        )}
      </Container>
    </header>
  );
}
