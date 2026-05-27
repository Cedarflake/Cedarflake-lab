"use client";

import type { PropsWithChildren } from "react";
import { ThemeProvider } from "next-themes";

import { themeConfig } from "@/config/theme";

export function AppProviders({ children }: PropsWithChildren) {
  return <ThemeProvider {...themeConfig}>{children}</ThemeProvider>;
}
