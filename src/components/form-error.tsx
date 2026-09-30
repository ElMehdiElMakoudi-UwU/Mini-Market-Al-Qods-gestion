"use client";

import { useI18n } from "@/i18n/client";

export function FormError({ error }: { error?: string }) {
  const { t } = useI18n();
  if (!error) return null;
  const messages: Record<string, string> = t.errors;
  return <p className="w-full text-sm text-red-600">{messages[error] ?? t.errors.generic}</p>;
}
