"use client";

import Link from "next/link";
import { LogIn, Settings } from "lucide-react";
import { useTranslations } from "next-intl";

import { authClient } from "@/lib/auth/client";

export function OwnerAccessLink() {
  const t = useTranslations("OwnerAccess");
  const { data: session, isPending } = authClient.useSession();
  const isSignedIn = session !== null && session !== undefined;
  const Icon = isSignedIn ? Settings : LogIn;
  const label = isPending
    ? t("pending")
    : isSignedIn
      ? t("admin")
      : t("signIn");

  return (
    <Link
      className="action-button"
      href={isSignedIn ? "/admin" : "/login?returnTo=%2Fadmin"}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
      <span aria-live="polite">{label}</span>
    </Link>
  );
}
