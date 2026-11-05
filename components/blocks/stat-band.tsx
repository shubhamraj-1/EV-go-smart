import { Container } from "@/components/ui/container";
import { cn } from "@/lib/utils";

export type Stat = {
  value: string;
  unit?: string;
  label: string;
};

type StatBandProps = {
  items: readonly Stat[];
  note: string;
};

/**
 * Target-metric band. Number values are honest pilot targets, not
 * live coverage — the note below the band says so.
 */
export function StatBand({ items, note }: StatBandProps) {
  return (
    <div className="border-t border-line bg-surface-2">
      <Container>
        <ul className="grid md:grid-cols-3 max-md:py-1.5">
          {items.map((stat, index) => (
            <li
              key={stat.label}
              className={cn(
                "py-[30px] pr-[30px]",
                index > 0 && "md:border-l md:border-line md:pl-[34px]",
                "max-md:border-t max-md:border-line max-md:py-[18px] max-md:pr-0 max-md:pl-0",
                index === 0 && "max-md:border-t-0",
              )}
            >
              <p className="text-[clamp(30px,3.4vw,40px)] font-bold leading-none tracking-[-.05em]">
                {stat.value}
                {stat.unit ? (
                  <span className="ml-0.5 text-[.55em] tracking-normal text-accent [vertical-align:.35em]">
                    {stat.unit}
                  </span>
                ) : null}
              </p>
              <p className="mt-2 text-[12.5px] font-semibold text-muted">{stat.label}</p>
            </li>
          ))}
        </ul>

        <p className="pb-[15px] text-[10.5px] tracking-[.03em] text-subtle max-md:pb-4">
          {note}
        </p>
      </Container>
    </div>
  );
}
