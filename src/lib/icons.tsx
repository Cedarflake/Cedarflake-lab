/**
 * Mock: Icon components used in ActionBadge.
 * Simple SVG placeholders for preview.
 */

import React from "react";

function createIcon(pathD: string, displayName: string) {
  const Icon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={pathD} />
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

// Refresh / sync
export const ArrowRefreshIcon = createIcon(
  "M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15",
  "ArrowRefreshIcon",
);

// Browser / Edge
export const EdgeIcon = createIcon(
  "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  "EdgeIcon",
);

// Cursor / click
export const CursorClickIcon = createIcon("M13 2L3 14h9l-1 8 10-12h-9l1-8z", "CursorClickIcon");

// Cloud / OneDrive
export const OnedriveIcon = createIcon(
  "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z",
  "OnedriveIcon",
);

// Mail / Outlook
export const OutlookIcon = createIcon(
  "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6",
  "OutlookIcon",
);

// Calendar
export const GoogleCalendarIcon = createIcon(
  "M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18",
  "GoogleCalendarIcon",
);

// Gmail
export const GoogleGmailIcon = createIcon(
  "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6",
  "GoogleGmailIcon",
);

// Generic mail
export const EmailIcon = createIcon(
  "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6",
  "EmailIcon",
);

// Search
export const SearchIcon = createIcon(
  "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35",
  "SearchIcon",
);

// Calendar / schedule
export const CalendarIcon = createIcon(
  "M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18",
  "CalendarIcon",
);

// Send
export const SendEmailIcon = createIcon("M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z", "SendEmailIcon");

// Revaea: clear will / inner focus
export const WillIcon = createIcon(
  "M12 3c4 0 7 2.8 9 9-2 6.2-5 9-9 9s-7-2.8-9-9c2-6.2 5-9 9-9zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  "WillIcon",
);

// Revaea: thought becoming visible form
export const ManifestationIcon = createIcon(
  "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83M12 8l3.5 2v4L12 16l-3.5-2v-4L12 8z",
  "ManifestationIcon",
);

// Revaea: resonance / shared vibration
export const ResonanceIcon = createIcon(
  "M4 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0M4 6c2-2 4-2 6 0s4 2 6 0 4-2 6 0M4 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0",
  "ResonanceIcon",
);

// Revaea: soul-conducting array
export const SoulArrayIcon = createIcon(
  "M12 3v18M4 7l8 5 8-5M4 17l8-5 8 5M4 7v10M20 7v10M8 9.5v5M16 9.5v5",
  "SoulArrayIcon",
);

// Revaea: emotion bloom / magic manifestation
export const BloomIcon = createIcon(
  "M12 12c-3-4-1-8 0-9 1 1 3 5 0 9zM12 12c4-3 8-1 9 0-1 1-5 3-9 0zM12 12c3 4 1 8 0 9-1-1-3-5 0-9zM12 12c-4 3-8 1-9 0 1-1 5-3 9 0z",
  "BloomIcon",
);

// Revaea: mind-rings / shared thought
export const MindRingIcon = createIcon(
  "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3",
  "MindRingIcon",
);

// Revaea: dream weaving / thread and star
export const DreamWeaveIcon = createIcon(
  "M4 17c4-8 12 2 16-6M4 7c4 8 12-2 16 6M12 2l1.2 3.2L16 6.4l-2.8 1.2L12 11l-1.2-3.4L8 6.4l2.8-1.2L12 2z",
  "DreamWeaveIcon",
);

// Revaea: tea circle / healing ritual
export const TeaCircleIcon = createIcon(
  "M5 10h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5v-4zM15 11h2a2 2 0 0 1 0 4h-2M8 6c0-1 .8-1.5.8-2.5M11 6c0-1 .8-1.5.8-2.5M4 21h12",
  "TeaCircleIcon",
);

// Revaea: memory archive / living pages
export const MemoryLibraryIcon = createIcon(
  "M4 5a3 3 0 0 1 3-3h13v17H7a3 3 0 0 0-3 3V5zM4 19a3 3 0 0 1 3-3h13M8 6h8M8 10h6",
  "MemoryLibraryIcon",
);

// Revaea: illusion garden / art becoming air
export const IllusionGardenIcon = createIcon(
  "M5 20c5-1 10-5 14-12M8 16c-3-1-4-4-3-7 3 0 5 2 5 5M14 12c-1-4 1-7 5-8 1 4-1 7-5 8M12 21v-9",
  "IllusionGardenIcon",
);

// Revaea: healing warmth
export const HealingIcon = createIcon(
  "M12 21s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.2-8 11-8 11zM12 8v6M9 11h6",
  "HealingIcon",
);

// Revaea: star song
export const StarSongIcon = createIcon(
  "M12 2l1.6 5 5.4.1-4.3 3.1 1.6 5-4.3-3.1-4.3 3.1 1.6-5L5 7.1l5.4-.1L12 2zM4 18c2-1 4-1 6 0s4 1 6 0 3-1 4 0",
  "StarSongIcon",
);
