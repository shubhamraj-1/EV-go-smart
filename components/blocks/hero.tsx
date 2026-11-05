import { ArrowRight, Clock, CreditCard, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";
import {
  EtaRing,
  IllustrativeMap,
  MapLabel,
  MapPin,
} from "@/components/maps/illustrative-map";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";

const trustPoints = [
  { icon: ShieldCheck, label: "Verified technicians" },
  { icon: Clock, label: "22 min target ETA" },
  { icon: CreditCard, label: "Pay after service" },
] as const;

export function Hero() {
  return (
    <section className="relative">
      <Container className="grid items-center gap-[54px] pt-[38px] pb-[74px] lg:grid-cols-[1.02fr_.98fr] max-lg:gap-[42px] max-lg:pb-[60px] max-md:pt-[22px]">
        <div className="relative z-[2]">
          <Eyebrow>On-demand EV charging · Bengaluru pilot</Eyebrow>

          <h1 className="mt-5 max-w-[12ch] text-[clamp(43px,5.5vw,70px)] font-bold leading-[1.01] tracking-[-.052em] max-lg:max-w-[14ch] max-md:text-[clamp(39px,11vw,54px)]">
            Stranded? We bring the{" "}
            <span className="relative isolate whitespace-nowrap after:absolute after:inset-x-[-2px] after:bottom-[.055em] after:-z-10 after:h-[.2em] after:rounded-[4px] after:bg-accent-soft after:content-['']">
              charge
            </span>{" "}
            to you.
          </h1>

          <p className="mt-[22px] max-w-[50ch] text-[17px] leading-[1.65] text-muted max-md:text-[15.5px]">
            A mobile charging van reaches you in minutes — not a tow truck. Live
            ETA, transparent pricing, and a verified technician from request to
            recharge.
          </p>

          <div className="mt-[30px] flex flex-wrap gap-[11px]">
            <Button asChild className="max-sm:w-full">
              <Link href="/sign-up">
                <Zap className="size-[18px]" strokeWidth={1.8} aria-hidden />
                Get help now
              </Link>
            </Button>
            <Button asChild variant="secondary" className="max-sm:w-full">
              <Link href="#how">
                See how it works
                <ArrowRight className="size-[15px]" strokeWidth={2} aria-hidden />
              </Link>
            </Button>
          </div>

          <div className="mt-[26px] flex max-w-[520px] flex-wrap gap-[18px] border-t border-line pt-[22px] max-sm:gap-x-4 max-sm:gap-y-2.5">
            {trustPoints.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-[7px] text-[12.5px] font-semibold text-muted"
              >
                <Icon className="size-[15px] text-accent" strokeWidth={1.8} aria-hidden />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="relative z-[1] grid min-h-[520px] place-items-center max-lg:min-h-0 max-lg:pt-1.5 max-lg:pb-[18px] max-md:pt-6">
          <div
            aria-hidden="true"
            className="absolute aspect-square w-[min(460px,100%)] rounded-full bg-radial from-accent/13 to-transparent to-66% blur-[6px]"
          />

          <div className="absolute top-[28px] left-0 z-[3] flex items-center gap-[9px] rounded-xl bg-ink px-[13px] py-2.5 text-[11.5px] font-semibold tracking-[-.005em] text-page shadow-float-ink max-md:-top-1.5 max-sm:px-2.5 max-sm:py-2 max-sm:text-[10px]">
            <span className="relative size-[7px] rounded-full bg-signal after:absolute after:-inset-1 after:animate-pulse-ring after:rounded-full after:border after:border-signal after:content-['']" />
            Driver assigned · 6:44 PM
          </div>

          <article
            aria-label="Example live booking"
            className="relative w-[min(100%,440px)] overflow-hidden rounded-shell border border-line bg-surface shadow-float lg:-rotate-[.4deg]"
          >
            <div className="flex items-center justify-between gap-3 px-[18px] pt-4 pb-[13px]">
              <span className="text-[10.5px] font-bold tracking-[.13em] text-subtle uppercase">
                Active request
              </span>
              <span className="text-[11px] font-semibold tabular-nums text-muted">
                EVG-2026-000123
              </span>
            </div>

            <IllustrativeMap variant="hero" className="h-[186px] border-y border-line">
              <MapLabel left="9%" top="52%">
                EV-01 · En route
              </MapLabel>
              <MapLabel left="50%" top="8%">
                You · Indiranagar
              </MapLabel>
              <MapPin kind="van" left="13.5%" top="80%" />
              <MapPin kind="dest" left="82%" top="17%" />
              <EtaRing
                minutes={12}
                className="top-[15px] left-[15px] size-[78px] max-sm:top-3 max-sm:right-3 max-sm:left-auto max-sm:size-[66px]"
              />
            </IllustrativeMap>

            <div className="px-[19px] pt-[18px] pb-[19px]">
              <h3 className="text-xl font-bold tracking-[-.03em]">
                Ravi is 12 minutes away
              </h3>
              <p className="mt-[3px] text-[12.5px] text-muted">
                En route to 12th Main, Indiranagar · 11 kWh to 60%
              </p>

              <div className="mt-4 flex items-center gap-[11px] border-t border-line pt-[15px]">
                <span className="grid size-[39px] flex-none place-items-center rounded-full bg-accent-soft text-[12.5px] font-extrabold tracking-[.02em] text-accent-deep">
                  RK
                </span>
                <span className="min-w-0">
                  <b className="block text-[13.5px] tracking-[-.01em]">Ravi Kumar</b>
                  <small className="mt-px block text-[11.5px] text-muted">
                    4.9 ★ · 312 charges · EV-01
                  </small>
                </span>
                <span className="ml-auto rounded-[7px] border border-line bg-surface-2 px-2 py-[5px] text-[10.5px] font-bold tracking-[.08em] whitespace-nowrap text-muted">
                  KA 01 EV 2043
                </span>
              </div>
            </div>
          </article>
        </div>
      </Container>
    </section>
  );
}
