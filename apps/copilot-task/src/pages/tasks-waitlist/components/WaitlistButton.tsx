/**
 * WaitlistButton - template CTA link.
 *
 * The original page used a waitlist/sign-in flow. For the reusable template,
 * this renders as a plain configured link instead of a mocked backend action.
 */

import { cn } from "@/lib/utils";
import { useTemplateConfig } from "@/template/useTemplateConfig";
import type { ButtonPlacement } from "../types";

// Button style variants

const BUTTON_STYLES: Record<ButtonPlacement, { size: string; idle: string }> = {
  home: {
    size: "px-5 py-3 text-base-dense",
    idle: "bg-background-800 text-foreground-100 focus-visible:bg-black safe-hover:bg-black dark:bg-background-100 dark:text-foreground-900 dark:focus-visible:bg-background-150 dark:safe-hover:bg-background-150",
  },
  floating: {
    size: "px-6 py-3 text-base-dense",
    idle: "bg-background-800 text-foreground-100 focus-visible:bg-black safe-hover:bg-black dark:bg-background-300 dark:text-foreground-900 dark:focus-visible:bg-background-300/80 dark:safe-hover:bg-background-300/80",
  },
  footer: {
    size: "px-7 py-3.5 text-md",
    idle: "bg-white text-foreground-800 dark:text-foreground-200 focus-visible:bg-white/90 safe-hover:bg-white/90",
  },
};

// Component

interface WaitlistButtonProps {
  placement?: ButtonPlacement;
}

export function WaitlistButton({ placement = "home" }: WaitlistButtonProps) {
  const template = useTemplateConfig();
  const { size, idle } = BUTTON_STYLES[placement];
  const isExternal = template.cta.target === "_blank";

  return (
    <a
      href={template.cta.href}
      target={template.cta.target}
      rel={isExternal ? "noreferrer" : undefined}
      className={cn(
        "inline-flex min-w-44 items-center justify-center rounded-full select-none active:opacity-80",
        size,
        idle,
      )}
    >
      {template.cta.label}
    </a>
  );
}
