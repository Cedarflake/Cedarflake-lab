import containerQueries from "@tailwindcss/container-queries";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: Object.fromEntries(
          [100, 150, 200, 250, 300, 350, 400, 450, 550, 600, 650, 700, 750, 800, 850, 900].map(
            (n) => [n, `rgb(var(--color-background-${n}))`],
          ),
        ),
        foreground: Object.fromEntries(
          [100, 150, 200, 250, 300, 350, 400, 450, 550, 600, 650, 700, 750, 800, 850, 900].map(
            (n) => [n, `rgb(var(--color-foreground-${n}))`],
          ),
        ),
        stroke: Object.fromEntries(
          [250, 300, 450, 900].map((n) => [n, `rgb(var(--color-stroke-${n}))`]),
        ),
        accent: Object.fromEntries([100].map((n) => [n, `rgb(var(--color-accent-${n}))`])),
      },
      fontFamily: {
        sans: [
          "Ginto",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
      },
      spacing: {
        22: "5.5rem",
      },
      gridTemplateColumns: {
        16: "repeat(16, minmax(0, 1fr))",
      },
      gridTemplateRows: {
        3: "repeat(3, minmax(0, 1fr))",
      },
      containers: {
        "section-one": "section-one",
      },
    },
  },
  plugins: [containerQueries],
};
