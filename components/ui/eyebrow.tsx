import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EyebrowProps = {
  children: ReactNode;
  className?: string;
};

export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <p
      className={cn(
        "flex items-center gap-2.5 text-[11.5px] font-bold tracking-[.14em] text-accent uppercase before:h-[1.5px] before:w-[22px] before:bg-current before:opacity-55 before:content-['']",
        className,
      )}
    >
      {children}
    </p>
  );
}
