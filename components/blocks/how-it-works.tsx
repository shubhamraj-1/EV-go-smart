import { ArrowRight, MapPin, Plus, Route, Zap } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/utils";

export type Step = {
  number: string;
  icon: "pin" | "route" | "bolt";
  title: string;
  body: string;
  foot: string;
};

export type CoverageChip = {
  label: string;
  planned?: boolean;
  icon?: "pin" | "plus";
};

const stepIcons = {
  pin: MapPin,
  route: Route,
  bolt: Zap,
} as const;

type HowItWorksProps = {
  steps: readonly Step[];
  coverage: readonly CoverageChip[];
};

export function HowItWorks({ steps, coverage }: HowItWorksProps) {
  return (
    <section id="how" className="scroll-mt-8 py-[86px] max-md:py-[58px]">
      <Container>
        <div className="mb-[34px] flex items-end justify-between gap-[30px] max-lg:block">
          <div>
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-3 max-w-[16ch] text-[clamp(30px,3.7vw,44px)] font-bold leading-[1.08] tracking-[-.045em]">
              Three steps between stranded and moving.
            </h2>
          </div>
          <p className="max-w-[36ch] pb-1 text-sm leading-[1.65] text-muted max-lg:mt-3.5">
            No tow truck, no detour. The van comes to the car, and the whole
            request stays visible from your phone.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((step) => {
            const Icon = stepIcons[step.icon];

            return (
              <article
                key={step.number}
                className="relative rounded-card border border-line bg-surface p-[26px] shadow-hairline transition-[transform,box-shadow] duration-[220ms] ease-calm hover:-translate-y-[3px] hover:shadow-lift"
              >
                <div className="mb-[34px] flex items-center justify-between">
                  <span className="grid size-[33px] place-items-center rounded-full bg-accent-softer text-xs font-extrabold tracking-[.02em] text-accent">
                    {step.number}
                  </span>
                  <Icon className="size-[26px] text-accent" strokeWidth={1.6} aria-hidden />
                </div>

                <h3 className="text-[17px] font-bold tracking-[-.025em]">{step.title}</h3>
                <p className="mt-[7px] text-[13px] leading-[1.62] text-muted">{step.body}</p>

                <p className="mt-5 flex items-center gap-1.5 text-[11.5px] font-semibold text-accent">
                  {step.foot}
                  <ArrowRight className="size-[15px]" strokeWidth={2} aria-hidden />
                </p>
              </article>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-2" aria-label="Service coverage">
          {coverage.map((chip) => {
            const Icon = chip.icon === "plus" ? Plus : MapPin;

            return (
              <span
                key={chip.label}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-[7px] text-[11.5px] font-semibold text-muted",
                  chip.planned && "border-dashed text-subtle",
                )}
              >
                <Icon
                  className={cn("size-[13px]", chip.planned ? "text-subtle" : "text-accent")}
                  strokeWidth={1.8}
                  aria-hidden
                />
                {chip.label}
              </span>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
