import { Zap } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  size?: "sm" | "md";
};

export function Logo({ className, size = "md" }: LogoProps) {
  return (
    <Link
      href="/"
      aria-label="EVgoSmart home"
      className={cn(
        "inline-flex items-center gap-2.5 font-extrabold tracking-[-.035em]",
        size === "md" ? "text-xl" : "text-base",
        className,
      )}
    >
      <span
        className={cn(
          "grid place-items-center bg-accent text-white",
          size === "md" ? "size-[29px] rounded-[9px]" : "size-6 rounded-[7px]",
        )}
      >
        <Zap
          aria-hidden
          strokeWidth={0}
          className={cn("fill-current", size === "md" ? "size-4" : "size-3.5")}
        />
      </span>
      EVgoSmart
    </Link>
  );
}
