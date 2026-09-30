"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveCustomer } from "@/actions/customers";
import { useI18n } from "@/i18n/client";
import { centsToInput } from "@/lib/format";
import { FormError } from "@/components/form-error";

type C = { id: number; name: string; phone: string; note: string; creditLimit: number; active: boolean };

export function CustomerForm({ customer, isOwner }: { customer?: C; isOwner: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(saveCustomer, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && !customer) ref.current?.reset();
  }, [state, customer]);
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      {customer && <input type="hidden" name="id" value={customer.id} />}
      <div>
        <label className="label">{t.common.name} *</label>
        <input name="name" className="input" defaultValue={customer?.name} required />
      </div>
      <div>
        <label className="label">{t.common.phone}</label>
        <input name="phone" className="num input" inputMode="tel" defaultValue={customer?.phone} />
      </div>
      <div>
        <label className="label">{t.customers.creditLimit}</label>
        <input
          name="creditLimit"
          inputMode="decimal"
          className="num input"
          placeholder="0.00"
          defaultValue={customer && customer.creditLimit > 0 ? centsToInput(customer.creditLimit) : ""}
          disabled={!isOwner}
        />
        <p className="mt-1 text-xs text-muted">{isOwner ? t.customers.creditLimitHelp : t.customers.creditLimitLocked}</p>
      </div>
      {!customer && (
        <div>
          <label className="label">{t.customers.openingBalance}</label>
          <input name="openingBalance" inputMode="decimal" className="num input" placeholder="0.00" />
          <p className="mt-1 text-xs text-muted">{t.customers.openingHelp}</p>
        </div>
      )}
      <div className="sm:col-span-2">
        <label className="label">{t.common.note}</label>
        <input name="note" className="input" defaultValue={customer?.note} />
      </div>
      {customer && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={customer.active} /> {t.common.active}
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{customer ? t.common.save : `+ ${t.customers.new}`}</button>
        {state?.ok && <span className="text-sm text-brand-600">✓ {t.common.saved}</span>}
        <FormError error={state?.error} />
      </div>
    </form>
  );
}
