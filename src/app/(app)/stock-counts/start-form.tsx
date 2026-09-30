"use client";

import { useActionState } from "react";
import { startCount } from "@/actions/stock-counts";
import { useI18n } from "@/i18n/client";
import { FormError } from "@/components/form-error";

export function StartCountForm({ categories }: { categories: { id: number; name: string }[] }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(startCount, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">{t.stockCounts.scope}</label>
        <select name="categoryId" className="input" defaultValue="">
          <option value="">{t.stockCounts.allProducts}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t.common.note}</label>
        <input name="note" className="input" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{t.stockCounts.start}</button>
        <FormError error={state?.error} />
      </div>
    </form>
  );
}
