"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { adjustSupplier, paySupplier } from "@/actions/suppliers";
import { useI18n } from "@/i18n/client";
import { centsToInput } from "@/lib/format";
import { FormError } from "@/components/form-error";

function useResetOnSuccess(state: { ok?: boolean } | undefined) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return ref;
}

export function SupplierPaymentForm({
  supplierId,
  balance,
  cashOpen,
  isOwner,
}: {
  supplierId: number;
  balance: number;
  cashOpen: boolean;
  isOwner: boolean;
}) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(paySupplier, undefined);
  const defaultSource = cashOpen || !isOwner ? "cash" : "outside";
  const [source, setSource] = useState<"cash" | "outside">(defaultSource);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state?.ok) return;
    ref.current?.reset();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- back to the default source after a payment
    setSource(defaultSource);
  }, [state, defaultSource]);
  const blocked = source === "cash" && !cashOpen;
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="supplierId" value={supplierId} />
      {isOwner && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm has-checked:border-brand-500 has-checked:bg-brand-50">
            <input type="radio" name="source" value="cash" checked={source === "cash"} onChange={() => setSource("cash")} />
            {t.deliveries.fromCash}
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm has-checked:border-brand-500 has-checked:bg-brand-50">
            <input type="radio" name="source" value="outside" checked={source === "outside"} onChange={() => setSource("outside")} />
            {t.deliveries.outsideCash}
          </label>
        </div>
      )}
      {blocked && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t.errors.closed}</p>}
      <div className="flex gap-2">
        <input name="amount" inputMode="decimal" className="num input text-lg" placeholder={`${t.common.amount} (DH)`} required />
        {balance > 0 && (
          <button
            type="button"
            className="btn-secondary shrink-0"
            onClick={(e) => {
              const input = e.currentTarget.form?.elements.namedItem("amount") as HTMLInputElement | null;
              if (input) input.value = centsToInput(balance);
            }}
          >
            {t.common.all}
          </button>
        )}
      </div>
      <input name="note" className="input" placeholder={t.common.note} />
      <FormError error={state?.error} />
      {state?.ok && <p className="text-sm text-brand-600">✓ {t.common.saved}</p>}
      <button className="btn-primary w-full py-2.5" disabled={pending || balance <= 0 || blocked}>{t.suppliers.paymentSubmit}</button>
    </form>
  );
}

export function SupplierAdjustForm({ supplierId }: { supplierId: number }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(adjustSupplier, undefined);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="supplierId" value={supplierId} />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm has-checked:border-brand-500 has-checked:bg-brand-50">
          <input type="radio" name="direction" value="decrease" defaultChecked /> {t.customers.decrease}
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm has-checked:border-red-500 has-checked:bg-red-50">
          <input type="radio" name="direction" value="increase" /> {t.customers.increase}
        </label>
      </div>
      <input name="amount" inputMode="decimal" className="num input" placeholder={`${t.common.amount} (DH)`} required />
      <input name="reason" className="input" placeholder={t.common.reason} required />
      <FormError error={state?.error} />
      <button className="btn-secondary w-full" disabled={pending}>{t.common.confirm}</button>
    </form>
  );
}
