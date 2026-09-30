"use client";

import { useActionState, useEffect, useState } from "react";
import { voidSale } from "@/actions/sales";
import { useI18n } from "@/i18n/client";
import { Modal } from "@/components/numpad-modal";
import { FormError } from "@/components/form-error";

export function VoidSaleButton({ saleId, number }: { saleId: string; number: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(voidSale, undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close after the action succeeds
    if (state?.ok) setOpen(false);
  }, [state]);
  return (
    <>
      <button className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setOpen(true)}>
        {t.sales.void}
      </button>
      {open && (
        <Modal onClose={() => setOpen(false)}>
          <h2 className="mb-3 text-lg font-bold">
            {t.sales.void} <span className="num">#{number}</span>
          </h2>
          <form action={action} className="space-y-3">
            <input type="hidden" name="saleId" value={saleId} />
            <input name="reason" className="input" placeholder={t.sales.voidReason} required autoFocus />
            <FormError error={state?.error} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{t.common.cancel}</button>
              <button className="btn-danger" disabled={pending}>{t.common.confirm}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
