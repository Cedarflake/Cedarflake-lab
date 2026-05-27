import type {AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode} from "react";

import {cn} from "@/lib/utils";

const buttonVariants = {
  primary:
    "bg-primary text-primary-foreground hover:opacity-90 border-transparent",
  secondary:
    "bg-background text-foreground border-border hover:bg-surface-muted",
  ghost:
    "bg-transparent text-foreground border-transparent hover:bg-surface-muted",
} as const;

type ButtonVariant = keyof typeof buttonVariants;

interface SharedButtonProps {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: SharedButtonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  className,
  variant = "secondary",
  ...props
}: SharedButtonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
        buttonVariants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}
