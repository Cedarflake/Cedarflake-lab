/**
 * ActionBadge - A small badge showing an icon + label for feature actions.
 *
 * Used in Section 3 (Features) to display the related tools/services
 * for each feature (e.g., "Schedule with Calendar", "Save to OneDrive").
 */

import React from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import {
  Brain,
  Calendar,
  Cloud,
  Eye,
  Flower2,
  Globe2,
  HeartPulse,
  LibraryBig,
  Mail,
  MousePointerClick,
  Music2,
  Network,
  Palette,
  RefreshCcw,
  Search,
  Send,
  Sparkles,
  Star,
  Waves,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  arrowRefresh: RefreshCcw,
  edge: Globe2,
  cursorClick: MousePointerClick,
  onedrive: Cloud,
  outlook: Mail,
  googleCalendar: Calendar,
  googleGmail: Mail,
  email: Mail,
  search: Search,
  schedule: Calendar,
  sendEmail: Send,

  artifactSlides: Calendar,
  artifactDocuments: Mail,
  artifactSheets: Search,

  will: Eye,
  manifestation: Sparkles,
  resonance: Waves,
  soulArray: Network,
  bloom: Flower2,
  mindRing: Brain,
  dreamWeave: Star,
  teaCircle: HeartPulse,
  memoryLibrary: LibraryBig,
  illusionGarden: Palette,
  healing: HeartPulse,
  starSong: Music2,
};

interface ActionBadgeProps {
  label?: string;
  labelKey?: string;
  icon?: string;
  className?: string;
}

export function ActionBadge({ label, labelKey, icon, className }: ActionBadgeProps) {
  const { t } = useTranslation();
  const IconComponent = icon ? ICON_MAP[icon] : undefined;
  const text = label ?? (labelKey ? t(labelKey) : "");

  return (
    <span
      className={cn(
        "relative flex items-center gap-1.5 rounded-full",
        "border border-black/[.12] bg-white/[.15] px-3 py-1.5 text-sm",
        "text-foreground-600 dark:bg-white/5",
        "md:gap-2 md:px-3.5 md:text-base",
        className,
      )}
    >
      {IconComponent && <IconComponent className="size-4 shrink-0 md:size-5" />}
      <span className="px-0.5">{text}</span>
    </span>
  );
}
