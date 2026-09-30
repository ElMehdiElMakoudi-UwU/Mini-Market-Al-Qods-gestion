"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addCashMovement, closeCash, openCash } from "@/actions/cash";
import { useI18n } from "@/i18n/client";
import { pendingSales, syncSales } from "@/lib/pos-store";
import { FormError } from "@/components/form-error";

export function OpenCashForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(openCash, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1">
        <label className="label">{t.cash.openingCash}</label>
        <input name="openingCash" inputMode="decimal" className="num input text-lg" placeholder="0.00" required autoFocus />
      </div>
      <button className="btn-primary px-6 py-2.5" disabled={pending}>{t.cash.open}</button>
      <FormError error={state?.error} />
    </form>
  );
}

export function MovementForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(addCashMovement, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm has-checked:border-red-500 has-checked:bg-red-50">
          <input type="radio" name="type" value="OUT" defaultChecked /> {t.cash.out}
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm has-checked:border-brand-500 has-checked:bg-brand-50">
          <input type="radio" name="type" value="IN" /> {t.cash.in}
        </label>
      </div>
      <input name="amount" inputMode="decimal" className="num input" placeholder={`${t.common.amount} (DH)`} required />
      <input name="reason" className="input" placeholder={t.common.reason} required />
      <FormError error={state?.error} />
      <button className="btn-secondary w-full" disabled={pending}>{t.cash.record}</button>
    </form>
  );
}

export function CloseCashForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(closeCash, undefined);
  const [unsynced, setUnsynced] = useState(0);

  // Sales still queued on this device must reach the server before closing,
  // otherwise the expected cash would be wrong.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if ((await pendingSales()).length > 0) await syncSales().catch(() => {});
      const n = (await pendingSales()).length;
      if (alive) setUnsynced(n);
    };
    check();
    const timer = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`${t.cash.close} ?`)) e.preventDefault();
      }}
      className="space-y-3"
    >
      <div>
        <label className="label">{t.cash.counted}</label>
        <input name="countedCash" inputMode="decimal" className="num input text-lg" placeholder="0.00" required />
      </div>
      <textarea name="note" className="input" rows={2} placeholder={t.common.note} />
      {unsynced > 0 && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">{t.cash.pendingBlock}</p>}
      <FormError error={state?.error} />
      <button className="btn-danger w-full py-2.5" disabled={pending || unsynced > 0}>{t.cash.close}</button>
    </form>
  );
}
