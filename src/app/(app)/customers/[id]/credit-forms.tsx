"use client";

import { useActionState, useEffect, useRef } from "react";
import { adjustCredit, recordPayment } from "@/actions/customers";
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

export function PaymentForm({ customerId, balance, cashOpen }: { customerId: number; balance: number; cashOpen: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(recordPayment, undefined);
  const ref = useResetOnSuccess(state);
  if (!cashOpen) return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{t.errors.closed}</p>;
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="flex gap-2">
        <input
          name="amount"
          inputMode="decimal"
          className="num input text-lg"
          placeholder={`${t.common.amount} (DH)`}
          required
        />
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
      <button className="btn-primary w-full py-2.5" disabled={pending || balance <= 0}>{t.customers.paymentSubmit}</button>
    </form>
  );
}

export function AdjustForm({ customerId }: { customerId: number }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(adjustCredit, undefined);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <input type="hidden" name="customerId" value={customerId} />
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
