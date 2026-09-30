"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createExpense, deleteExpense } from "@/actions/expenses";
import { useI18n } from "@/i18n/client";
import { FormError } from "@/components/form-error";

const CATEGORIES = ["RENT", "ELECTRICITY", "WATER", "SALARY", "PHONE_INTERNET", "TRANSPORT", "SUPPLIES", "MAINTENANCE", "TAXES", "OTHER"];

export function ExpenseForm({ isOwner, cashOpen, today }: { isOwner: boolean; cashOpen: boolean; today: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(createExpense, undefined);
  const defaultSource = cashOpen || !isOwner ? "cash" : "outside";
  const [source, setSource] = useState<"cash" | "outside">(defaultSource);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state?.ok) return;
    ref.current?.reset();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- back to the default source after saving
    setSource(defaultSource);
  }, [state, defaultSource]);
  const blocked = source === "cash" && !cashOpen;

  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">{t.expenses.category} *</label>
        <select name="category" className="input" required defaultValue="">
          <option value="" disabled>—</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{t.expenseCategories[c]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">{t.common.amount} (DH) *</label>
        <input name="amount" inputMode="decimal" className="num input" placeholder="0.00" required />
      </div>
      <div>
        <label className="label">{t.expenses.date}</label>
        <input type="date" name="date" className="input" defaultValue={today} max={today} />
      </div>
      <div>
        <label className="label">{t.common.note}</label>
        <input name="note" className="input" />
        <p className="mt-1 text-xs text-muted">{t.expenses.otherHelp}</p>
      </div>
      {isOwner && (
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <label className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm has-checked:border-brand-500 has-checked:bg-brand-50">
            <input type="radio" name="source" value="cash" checked={source === "cash"} onChange={() => setSource("cash")} />
            {t.expenses.fromCash}
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-line p-2 text-sm has-checked:border-brand-500 has-checked:bg-brand-50">
            <input type="radio" name="source" value="outside" checked={source === "outside"} onChange={() => setSource("outside")} />
            {t.expenses.outsideCash}
          </label>
        </div>
      )}
      {blocked && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-2">{t.errors.closed}</p>}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending || blocked}>+ {t.expenses.new}</button>
        {state?.ok && <span className="text-sm text-brand-600">✓ {t.common.saved}</span>}
        <FormError error={state?.error} />
      </div>
    </form>
  );
}

export function DeleteExpenseButton({ id }: { id: number }) {
  const { t } = useI18n();
  const [, action, pending] = useActionState(deleteExpense, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t.expenses.deleteConfirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="text-xs font-semibold text-red-600 hover:underline" disabled={pending}>{t.common.delete}</button>
    </form>
  );
}
