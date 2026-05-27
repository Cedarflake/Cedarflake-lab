import type {HTMLAttributes} from "react";

import {cn} from "@/lib/utils";

const badgeVariants = {
  default: "border-border/80 bg-background text-foreground",
  muted: "border-border/60 bg-surface-muted text-muted-foreground",
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  info: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  notice: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  warning: "border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  critical: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
} as const;

type BadgeVariant = keyof typeof badgeVariants;

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {variant?: BadgeVariant}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}
