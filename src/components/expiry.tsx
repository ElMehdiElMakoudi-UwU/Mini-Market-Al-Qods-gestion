"use client";

import { useActionState, useEffect, useRef } from "react";
import { addBatch, clearBatch } from "@/actions/expiry";
import { useI18n } from "@/i18n/client";
import { FormError } from "./form-error";

/** "Expired 3 d ago", "Today" or "In 5 d", colored by urgency. */
export function DaysLeft({ days }: { days: number }) {
  const { t } = useI18n();
  const color = days < 0 ? "bg-red-100 text-red-700" : days <= 7 ? "bg-amber-100 text-amber-800" : "bg-surface text-muted";
  const text =
    days < 0 ? `${t.expiry.expiredSince} ${-days} ${t.expiry.days}` : days === 0 ? t.expiry.today : `${t.expiry.in} ${days} ${t.expiry.days}`;
  return <span className={`badge ${color}`}>{text}</span>;
}

export function ClearBatchButton({ id }: { id: number }) {
  const { t } = useI18n();
  const [, action, pending] = useActionState(clearBatch, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t.expiry.clearConfirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="text-xs font-semibold text-muted hover:text-ink hover:underline" disabled={pending}>{t.expiry.clear}</button>
    </form>
  );
}

export function AddBatchForm({ productId, unit }: { productId: number; unit: "PIECE" | "KG" }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addBatch, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <div className="grid grid-cols-2 gap-2">
        <input type="date" name="expiryDate" className="input" required />
        <input
          name="quantity"
          inputMode="decimal"
          className="num input"
          placeholder={`${t.common.quantity}${unit === "KG" ? " (kg)" : ""}`}
          required
        />
      </div>
      <p className="text-xs text-muted">{t.expiry.addBatchHelp}</p>
      <FormError error={state?.error} />
      <button className="btn-secondary w-full" disabled={pending}>+ {t.expiry.addBatch}</button>
    </form>
  );
}
