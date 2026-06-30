/**
 * SVG brand components for the Revaea world-entry page.
 *
 * Component names stay stable because the section components import them as part
 * of the reusable template surface.
 */

import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  title?: string;
  titleId?: string;
}

function RevaeaMark({
  size = 72,
  x = 0,
  y = 0,
  className,
}: {
  size?: number;
  x?: number;
  y?: number;
  className?: string;
}) {
  return (
    <image
      href="/Revaea-o.svg"
      x={x}
      y={y}
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      className={className}
    />
  );
}

const revaeaLogoFont = 'RevaeaSerif, Georgia, "Times New Roman", serif';

// ===================== Revaea Wordmark (Section 1) =====================

export const CopilotWordmark: React.FC<IconProps> = ({ title, titleId, ...props }) => (
  <svg
    viewBox="0 0 220 72"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-labelledby={titleId}
    {...props}
  >
    {title ? <title id={titleId}>{title}</title> : null}
    <RevaeaMark size={42} y={12} />
    <text
      x="54"
      y="49"
      fill="currentColor"
      fontFamily={revaeaLogoFont}
      fontSize="40"
      fontWeight="700"
      letterSpacing="0.2"
    >
      Revaea
    </text>
  </svg>
);

// ===================== Revaea Logo (Footer) =====================

export const CopilotTasksLogo: React.FC<IconProps> = ({ title, titleId, ...props }) => (
  <svg
    viewBox="0 0 760 180"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-labelledby={titleId}
    {...props}
  >
    {title ? <title id={titleId}>{title}</title> : null}
    <g transform="translate(206 22)">
      <RevaeaMark size={62} y={0} />
      <text
        x="92"
        y="61"
        fill="currentColor"
        fontFamily={revaeaLogoFont}
        fontSize="82"
        fontWeight="700"
        letterSpacing="0.2"
      >
        Revaea
      </text>
    </g>
    <text
      x="380"
      y="140"
      fill="currentColor"
      fillOpacity="0.55"
      fontFamily={revaeaLogoFont}
      fontSize="30"
      fontWeight="700"
      letterSpacing="0.2"
      textAnchor="middle"
    >
      Woven by Will, Lit by Peace
    </text>
  </svg>
);

// ===================== Chevron Down (Scroll Indicator) =====================

export const ChevronDownIcon: React.FC<IconProps> = ({ title, titleId, ...props }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-labelledby={titleId}
    {...props}
  >
    {title ? <title id={titleId}>{title}</title> : null}
    <path
      d="M4.21967 8.46967C4.51256 8.17678 4.98744 8.17678 5.28033 8.46967L12 15.1893L18.7197 8.46967C19.0126 8.17678 19.4874 8.17678 19.7803 8.46967C20.0732 8.76256 20.0732 9.23744 19.7803 9.53033L12.5303 16.7803C12.2374 17.0732 11.7626 17.0732 11.4697 16.7803L4.21967 9.53033C3.92678 9.23744 3.92678 8.76256 4.21967 8.46967Z"
      fill="currentColor"
    />
  </svg>
);
