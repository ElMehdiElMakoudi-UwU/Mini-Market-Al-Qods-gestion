import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { PageHeader } from "@/components/page-header";
import { UserForm } from "./user-form";

export default async function UsersPage() {
  const me = await requireUser("OWNER");
  const { t } = await getDict();
  const rows = await db
    .select({ id: users.id, name: users.name, username: users.username, role: users.role, active: users.active })
    .from(users)
    .orderBy(asc(users.name));
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.users.title} />
      <div className="card p-5">
        <h2 className="mb-3 font-bold">{t.users.new}</h2>
        <UserForm />
      </div>
      {rows.map((u) => (
        <details key={u.id} className="card p-5">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2">
            <span className="font-semibold">{u.name}</span>
            <span className="num text-sm text-muted">@{u.username}</span>
            <span className="badge bg-surface">{t.roles[u.role]}</span>
            {!u.active && <span className="badge bg-red-50 text-red-700">{t.common.inactive}</span>}
            {u.id === me.id && <span className="text-xs text-muted">(vous)</span>}
          </summary>
          <div className="mt-4">
            <UserForm user={u} />
          </div>
        </details>
      ))}
    </div>
  );
}
