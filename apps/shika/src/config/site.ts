export const siteConfig = {
  name: "Shika",
  title: "Shika",
  description:
    "A scalable web foundation with styling, theming, assets, engineering workflows and internationalization built in.",
  url: "https://shika.example",
  author: "Cedarflake",
  keywords: [
    "Shika",
    "Next.js",
    "TypeScript",
    "Tailwind CSS",
    "Design System",
    "i18n",
  ],
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: "#f5f7fb",
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: "#0f1117",
    },
  ],
  navigation: [
    {
      id: "style-system",
      href: "#style-system",
    },
    {
      id: "asset-system",
      href: "#asset-system",
    },
    {
      id: "engineering",
      href: "#engineering",
    },
  ],
} as const;
