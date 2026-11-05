import { Check } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { formatInr } from "@/lib/money";

type PricingProps = {
  city: string;
  /** Integer paise. */
  baseFeePaise: number;
  /** Integer paise per kWh. */
  perKwhPaise: number;
  exampleKwh: number;
};

/**
 * Illustrative demo pricing. The real estimate is computed server-side from
 * the active pricing rule; this block only explains the model.
 */
export function Pricing({ city, baseFeePaise, perKwhPaise, exampleKwh }: PricingProps) {
  const exampleEnergyPaise = perKwhPaise * exampleKwh;
  const exampleTotalPaise = baseFeePaise + exampleEnergyPaise;

  const points = [
    `${formatInr(baseFeePaise)} callout covers the van and technician`,
    `${formatInr(perKwhPaise)} per kWh delivered, measured on site`,
    "No surge pricing in the pilot",
    "Pay after the charge via Razorpay — UPI or card",
  ];

  return (
    <section id="pricing" className="scroll-mt-8 pt-[22px] pb-[86px] max-md:pb-[58px]">
      <Container className="grid items-center gap-14 lg:grid-cols-[.9fr_1.1fr] max-lg:gap-9">
        <div>
          <Eyebrow>Pricing</Eyebrow>
          <h2 className="mt-3 text-[clamp(31px,3.8vw,45px)] font-bold leading-[1.06] tracking-[-.045em]">
            One clear price. No surprise surge.
          </h2>
          <p className="mt-4 max-w-[40ch] text-[14.5px] leading-[1.7] text-muted">
            You see the estimate before you confirm, and the final amount is based
            on the energy delivered. Taxes are included in this demo.
          </p>

          <ul className="mt-[26px] grid gap-[11px]">
            {points.map((point) => (
              <li
                key={point}
                className="flex items-start gap-[9px] text-[13px] font-medium text-ink-2"
              >
                <Check
                  className="mt-0.5 size-[15px] flex-none text-accent"
                  strokeWidth={2.2}
                  aria-hidden
                />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative overflow-hidden rounded-shell border border-line bg-surface shadow-float">
          <div className="surface-gradient px-[26px] pt-[26px] pb-[22px]">
            <span className="text-[10.5px] font-bold tracking-[.14em] text-accent uppercase">
              Demo pricing · {city}
            </span>
            <p className="mt-3 flex items-baseline gap-[9px]">
              <b className="text-[52px] leading-none font-bold tracking-[-.055em]">
                {formatInr(baseFeePaise)}
              </b>
              <span className="text-[13px] font-semibold text-muted">callout</span>
            </p>
            <p className="mt-1.5 text-[10.5px] leading-[1.55] text-subtle">
              Plus {formatInr(perKwhPaise)} per kWh. Taxes included.
            </p>
          </div>

          <div className="px-[26px] pt-2 pb-[26px]">
            <div className="flex items-center justify-between border-b border-line py-[13px] text-[13px]">
              <span className="text-muted">Energy rate</span>
              <b className="font-semibold tabular-nums">
                {formatInr(perKwhPaise)} / kWh
              </b>
            </div>
            <div className="flex items-center justify-between border-b border-line py-[13px] text-[13px]">
              <span className="text-muted">Example: {exampleKwh} kWh delivered</span>
              <b className="font-semibold tabular-nums">{formatInr(exampleEnergyPaise)}</b>
            </div>
            <div className="flex items-center justify-between py-[13px] text-[13px]">
              <span className="text-muted">Payment timing</span>
              <b className="font-semibold">After service</b>
            </div>

            <div className="mt-2 flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3.5 py-[13px] text-xs text-muted">
              <span>Estimated total</span>
              <b className="text-[15px] tracking-[-.02em] text-ink">
                {formatInr(exampleTotalPaise)}
              </b>
            </div>

            <p className="mt-3 text-[10.5px] leading-[1.55] text-subtle">
              Final bill uses delivered kWh. Demo pricing for the internship build
              — not a commercial offer.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
}
