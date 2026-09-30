"use client";

import { useActionState, useEffect, useRef } from "react";
import { createCategory } from "@/actions/products";
import { useI18n } from "@/i18n/client";
import { FormError } from "@/components/form-error";

export function CategoryForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(createCategory, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="card flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-40 flex-1">
        <label className="label">{t.products.nameFr} *</label>
        <input name="nameFr" className="input" required />
      </div>
      <div className="min-w-40 flex-1">
        <label className="label">{t.products.nameAr}</label>
        <input name="nameAr" className="input" dir="rtl" />
      </div>
      <button className="btn-primary" disabled={pending}>+ {t.products.newCategory}</button>
      <FormError error={state?.error} />
    </form>
  );
}
