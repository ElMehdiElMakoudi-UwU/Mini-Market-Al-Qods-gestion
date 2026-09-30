"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveUser } from "@/actions/users";
import { useI18n } from "@/i18n/client";
import { FormError } from "@/components/form-error";

type U = { id: number; name: string; username: string; role: "OWNER" | "MANAGER"; active: boolean };

export function UserForm({ user }: { user?: U }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(saveUser, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && !user) ref.current?.reset();
  }, [state, user]);
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div>
        <label className="label">{t.common.name}</label>
        <input name="name" className="input" defaultValue={user?.name} required />
      </div>
      <div>
        <label className="label">{t.login.username}</label>
        <input name="username" className="input" defaultValue={user?.username} autoCapitalize="none" required />
      </div>
      <div>
        <label className="label">{user ? t.users.newPassword : t.users.password}</label>
        <input name="password" type="password" className="input" autoComplete="new-password" required={!user} />
      </div>
      <div>
        <label className="label">{t.users.role}</label>
        <select name="role" className="input" defaultValue={user?.role ?? "MANAGER"}>
          <option value="MANAGER">{t.roles.MANAGER}</option>
          <option value="OWNER">{t.roles.OWNER}</option>
        </select>
      </div>
      {user && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={user.active} /> {t.common.active}
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button className="btn-primary" disabled={pending}>{user ? t.common.save : `+ ${t.users.new}`}</button>
        {state?.ok && <span className="text-sm text-brand-600">✓ {t.common.saved}</span>}
        <FormError error={state?.error} />
      </div>
    </form>
  );
}
