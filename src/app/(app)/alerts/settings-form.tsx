"use client";

import { useActionState } from "react";
import { saveAlertSettings } from "@/actions/alerts";
import { useI18n } from "@/i18n/client";
import { centsToInput } from "@/lib/format";
import { FormError } from "@/components/form-error";

export function AlertSettingsForm({ kinds, muted, cashThreshold }: { kinds: string[]; muted: string[]; cashThreshold: number }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(saveAlertSettings, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        {kinds.map((k) => (
          <label key={k} className="flex items-start gap-3 text-sm">
            <input type="checkbox" name={k} defaultChecked={!muted.includes(k)} className="mt-0.5 size-4" />
            {t.alerts.kinds[k] ?? k}
          </label>
        ))}
      </div>
      <div className="max-w-xs">
        <label className="label">{t.alerts.cashThreshold}</label>
        <input name="cashThreshold" className="input num" inputMode="decimal" defaultValue={centsToInput(cashThreshold)} />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{t.common.save}</button>
        {state?.ok && <span className="text-sm text-brand-600">✓ {t.common.saved}</span>}
        <FormError error={state?.error} />
      </div>
    </form>
  );
}
