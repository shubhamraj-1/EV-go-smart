import { Plus } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";

export type FaqItem = {
  question: string;
  answer: string;
};

type FaqProps = {
  items: readonly FaqItem[];
};

export function Faq({ items }: FaqProps) {
  return (
    <section id="faq" className="scroll-mt-8 pt-6 pb-[86px] max-md:pb-[58px]">
      <Container className="grid items-start gap-14 lg:grid-cols-[.55fr_1fr] max-lg:gap-9">
        <div>
          <Eyebrow>Questions</Eyebrow>
          <h2 className="mt-3 text-[clamp(28px,3.3vw,38px)] font-bold leading-[1.08] tracking-[-.04em]">
            Before you request.
          </h2>
        </div>

        <div className="border-t border-line-strong">
          {items.map((item, index) => (
            <details key={item.question} open={index === 0} className="group border-b border-line py-[18px]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-[18px] text-[14.5px] font-semibold tracking-[-.01em] [&::-webkit-details-marker]:hidden">
                {item.question}
                <Plus
                  className="size-[18px] flex-none text-muted transition-[transform,color] duration-200 ease-calm group-open:rotate-45 group-open:text-accent"
                  strokeWidth={1.8}
                  aria-hidden
                />
              </summary>
              <p className="mt-2.5 max-w-[62ch] text-[13px] leading-[1.65] text-muted">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
