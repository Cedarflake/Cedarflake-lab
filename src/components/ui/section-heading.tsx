import type {HTMLAttributes} from "react";

import {cn} from "@/lib/utils";

interface SectionHeadingProps extends HTMLAttributes<HTMLDivElement> {
  kicker?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}

export function SectionHeading({
  kicker,
  title,
  description,
  align = "left",
  className,
  ...props
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "space-y-3",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    >
      {kicker ? <p className="section-kicker">{kicker}</p> : null}
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {title}
        </h2>
        {description ? <p className="prose-subtle">{description}</p> : null}
      </div>
    </div>
  );
}
