import en from "../messages/en.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: "en" | "zh-CN";
    Messages: typeof en;
  }
}
