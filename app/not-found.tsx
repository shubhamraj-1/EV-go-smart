import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Logo } from "@/components/ui/logo";

/**
 * Shown for routes that exist in the plan but are not wired up yet
 * (for example `/request`, until the booking flow ships).
 */
export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center py-16">
      <Container className="max-w-[600px]">
        <div className="flex justify-center">
          <Logo />
        </div>

        <div className="mt-10 rounded-shell border border-line bg-surface p-8 text-center shadow-lift sm:p-10">
          <Eyebrow className="justify-center">404 · Not connected yet</Eyebrow>
          <h1 className="mt-4 text-[clamp(28px,4vw,38px)] font-bold leading-[1.08] tracking-[-.045em]">
            This part of the route is still being wired up.
          </h1>
          <p className="mx-auto mt-4 max-w-[46ch] text-[14px] leading-[1.7] text-muted">
            The landing page is live. Booking, live tracking, and the dispatch
            console arrive in the next slices — the demo fleet is not taking
            requests yet.
          </p>

          <div className="mt-7 flex flex-col justify-center gap-2.5 sm:flex-row">
            <Button asChild>
              <Link href="/">
                <ArrowLeft className="size-4" strokeWidth={2} aria-hidden />
                Back to home
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/#how">
                See how it works
                <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center text-[11.5px] text-subtle">
          Demo build · simulated fleet · Razorpay test mode
        </p>
      </Container>
    </main>
  );
}
