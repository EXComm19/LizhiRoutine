import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--card)] disabled:pointer-events-none disabled:opacity-40 select-none",
  {
    variants: {
      variant: {
        default:
          "rounded-lg border border-[color:var(--line)] bg-[color:var(--card)] text-[color:var(--ink)] hover:bg-[color:var(--sunken)]",
        primary:
          "rounded-lg bg-[color:var(--ink)] !text-[color:var(--card)] hover:opacity-90",
        ghost:
          "rounded-lg bg-transparent border border-transparent text-[color:var(--ink-2)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]",
        outline:
          "rounded-lg border border-[color:var(--line)] bg-[color:var(--card)] text-[color:var(--ink-2)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]",
        soft:
          "rounded-lg bg-[color:var(--sunken)] text-[color:var(--ink-2)] hover:bg-[color:var(--hover)] hover:text-[color:var(--ink)]",
        destructive:
          "rounded-lg text-[oklch(55%_0.18_25)] hover:bg-[oklch(95%_0.04_25)] dark:hover:bg-[oklch(28%_0.10_25)]",
        pill:
          "rounded-full bg-[color:var(--sunken)] border border-[color:var(--line)] text-[color:var(--ink)] hover:bg-[color:var(--hover)]",
      },
      size: {
        default: "h-8 px-3 text-[12.5px]",
        sm: "h-7 px-2.5 text-[11.5px]",
        lg: "h-9 px-3.5 text-[13px]",
        icon: "h-7 w-7",
        "icon-sm": "h-6 w-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
