const SVG_NS = "http://www.w3.org/2000/svg"

interface IconDefinition {
  viewBox: string
  fill: string
  stroke?: string
  strokeWidth?: string
  strokeLinecap?: "butt" | "round" | "square"
  strokeLinejoin?: "arcs" | "bevel" | "miter" | "miter-clip" | "round"
  paths: readonly string[]
}

const ICON_DEFINITIONS = {
  bolt: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    paths: ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"],
  },
  x: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    paths: ["M6 6l12 12", "M18 6L6 18"],
  },
  play: {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    paths: ["M8.5 5.5v13l11-6.5-11-6.5z"],
  },
  forward: {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    paths: ["M13 5l7 7-7 7", "M4 5l7 7-7 7"],
  },
} as const satisfies Record<string, IconDefinition>

export type IconName = keyof typeof ICON_DEFINITIONS

export function createIcon(name: IconName): SVGSVGElement {
  const definition = ICON_DEFINITIONS[name]
  const svg = document.createElementNS(SVG_NS, "svg")

  svg.setAttribute("viewBox", definition.viewBox)
  svg.setAttribute("fill", definition.fill)
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("focusable", "false")

  if ("stroke" in definition) {
    svg.setAttribute("stroke", definition.stroke)
  }

  if ("strokeWidth" in definition) {
    svg.setAttribute("stroke-width", definition.strokeWidth)
  }

  if ("strokeLinecap" in definition) {
    svg.setAttribute("stroke-linecap", definition.strokeLinecap)
  }

  if ("strokeLinejoin" in definition) {
    svg.setAttribute("stroke-linejoin", definition.strokeLinejoin)
  }

  for (const pathData of definition.paths) {
    const path = document.createElementNS(SVG_NS, "path")
    path.setAttribute("d", pathData)
    svg.appendChild(path)
  }

  return svg
}
