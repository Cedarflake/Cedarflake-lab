"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const t = useTranslations("Auth");
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");

  const handleSignOut = async () => {
    setIsPending(true);
    setMessage("");

    try {
      const result = await authClient.signOut();

      if (result.error) {
        setMessage(t("signOutFailed"));
        setIsPending(false);
        return;
      }

      window.location.assign("/login");
    } catch {
      setMessage(t("signOutFailed"));
      setIsPending(false);
    }
  };

  return (
    <div>
      <button
        aria-busy={isPending}
        className="action-button"
        disabled={isPending}
        onClick={handleSignOut}
        type="button"
      >
        <LogOut aria-hidden="true" className="size-4" strokeWidth={1.75} />
        {isPending ? t("signingOut") : t("signOut")}
      </button>
      <p
        aria-atomic="true"
        aria-live="polite"
        className={message ? "text-xs text-[var(--muted)]" : "sr-only"}
      >
        {isPending ? t("signingOut") : message}
      </p>
    </div>
  );
}
