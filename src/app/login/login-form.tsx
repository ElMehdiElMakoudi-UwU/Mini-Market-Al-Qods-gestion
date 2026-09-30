"use client";

import { useActionState } from "react";
import { login } from "@/actions/auth";
import { useI18n } from "@/i18n/client";

export function LoginForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="username">{t.login.username}</label>
        <input id="username" name="username" className="input" autoComplete="username" autoCapitalize="none" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="password">{t.login.password}</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {state?.error && <p className="text-sm text-red-600">{t.login.invalid}</p>}
      <button className="btn-primary w-full py-3" disabled={pending}>{t.login.submit}</button>
    </form>
  );
}
