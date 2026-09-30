"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveSupplier } from "@/actions/suppliers";
import { useI18n } from "@/i18n/client";
import { FormError } from "@/components/form-error";

export function SupplierForm({ supplier, isOwner }: { supplier?: { id: number; name: string; phone: string }; isOwner: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(saveSupplier, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && !supplier) ref.current?.reset();
  }, [state, supplier]);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      <div className="min-w-40 flex-1">
        <label className="label">{t.common.name} *</label>
        <input name="name" className="input" defaultValue={supplier?.name} required />
      </div>
      <div className="min-w-40 flex-1">
        <label className="label">{t.common.phone}</label>
        <input name="phone" className="num input" inputMode="tel" defaultValue={supplier?.phone} />
      </div>
      {!supplier && isOwner && (
        <div className="min-w-40 flex-1">
          <label className="label">{t.suppliers.openingBalance}</label>
          <input name="openingBalance" inputMode="decimal" className="num input" placeholder="0.00" />
        </div>
      )}
      <button className="btn-primary" disabled={pending}>{supplier ? t.common.save : `+ ${t.suppliers.new}`}</button>
      {state?.ok && supplier && <span className="text-sm text-brand-600">✓ {t.common.saved}</span>}
      {!supplier && isOwner && <p className="w-full text-xs text-muted">{t.suppliers.openingHelp}</p>}
      <FormError error={state?.error} />
    </form>
  );
}
