"use client";

import { useActionState, useEffect, useRef } from "react";
import { adjustStock } from "@/actions/products";
import { useI18n } from "@/i18n/client";
import { FormError } from "@/components/form-error";

export function AdjustStockForm({ productId }: { productId: number }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(adjustStock, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="productId" value={productId} />
      <input name="newStock" inputMode="decimal" className="num input" placeholder={t.products.newStock} required />
      <input name="reason" className="input" placeholder={t.common.reason} required />
      <FormError error={state?.error} />
      <button className="btn-secondary w-full" disabled={pending}>{t.common.save}</button>
    </form>
  );
}
