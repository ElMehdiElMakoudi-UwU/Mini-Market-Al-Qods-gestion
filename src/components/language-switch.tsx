"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLanguage } from "@/actions/auth";
import { useI18n } from "@/i18n/client";

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = locale === "ar" ? "fr" : "ar";
  return (
    <button
      type="button"
      disabled={pending}
      className={`btn-secondary px-3 py-1.5 ${className}`}
      onClick={() => start(async () => { await setLanguage(next); router.refresh(); })}
    >
      {next === "ar" ? "العربية" : "Français"}
    </button>
  );
}
