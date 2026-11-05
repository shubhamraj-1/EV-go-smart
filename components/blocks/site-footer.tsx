import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";

const footerLinks = [
  { href: "#how", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-2">
      <Container className="flex flex-wrap items-center gap-[18px] py-7 max-md:gap-3">
        <Logo size="sm" />

        <nav aria-label="Footer" className="flex gap-[18px] text-[11.5px] text-muted">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors duration-150 hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="ml-auto text-[11.5px] text-subtle max-lg:order-5 max-lg:ml-0 max-lg:w-full">
          Concept demo · simulated fleet · Razorpay test mode
        </p>
      </Container>
    </footer>
  );
}
