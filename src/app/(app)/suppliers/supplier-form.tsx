"use client";

import { useActionState, useEffect, useRef } from "react";
import { createSupplier } from "@/actions/deliveries";
import { useI18n } from "@/i18n/client";
import { FormError } from "@/components/form-error";

export function SupplierForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(createSupplier, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-40 flex-1">
        <label className="label">{t.common.name} *</label>
        <input name="name" className="input" required />
      </div>
      <div className="min-w-40 flex-1">
        <label className="label">{t.common.phone}</label>
        <input name="phone" className="num input" inputMode="tel" />
      </div>
      <button className="btn-primary" disabled={pending}>+ {t.suppliers.new}</button>
      <FormError error={state?.error} />
    </form>
  );
}
