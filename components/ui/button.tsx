import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2.5 rounded-full border border-transparent font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-calm active:translate-y-px disabled:pointer-events-none disabled:opacity-60",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-white shadow-[0_10px_24px_-14px_rgb(13_107_78/0.8)] hover:bg-accent-deep",
        secondary:
          "border-line-strong bg-surface text-ink shadow-hairline hover:border-accent hover:text-accent",
        quiet: "bg-accent-softer text-accent hover:bg-accent-soft",
        dark: "bg-ink text-white hover:bg-ink-2",
      },
      size: {
        md: "min-h-[46px] px-5 text-[14.5px]",
        sm: "min-h-9 px-3.5 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

/**
 * Button primitive. Use `asChild` to render a Next.js Link with button styles.
 */
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
