"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { authClient } from "@/lib/auth/client";

interface GitHubSignInButtonProps {
  returnTo: string;
}

export function GitHubSignInButton({ returnTo }: GitHubSignInButtonProps) {
  const t = useTranslations("Auth");
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState("");

  const handleSignIn = async () => {
    setIsPending(true);
    setMessage("");

    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: returnTo,
        errorCallbackURL: "/auth-error",
      });

      if (result.error) {
        setMessage(t("signInFailed"));
        setIsPending(false);
      }
    } catch {
      setMessage(t("signInFailed"));
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        aria-busy={isPending}
        className="action-button action-button-primary"
        disabled={isPending}
        onClick={handleSignIn}
        type="button"
      >
        {isPending ? t("openingGitHub") : t("continueWithGitHub")}
      </button>
      <p
        aria-atomic="true"
        aria-live="polite"
        className={message ? "text-sm text-[var(--muted)]" : "sr-only"}
      >
        {isPending ? t("openingGitHub") : message}
      </p>
    </div>
  );
}
