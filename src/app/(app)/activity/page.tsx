import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDict } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { describeAudit } from "@/lib/audit-describe";
import { PageHeader } from "@/components/page-header";

export default async function ActivityPage() {
  await requireUser("OWNER");
  const { t, locale } = await getDict();
  const rows = await db
    .select({ a: auditLogs, userName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(300);
  return (
    <div className="space-y-6">
      <PageHeader title={t.activity.title} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t.common.date}</th>
              <th>{t.common.user}</th>
              <th>{t.activity.action}</th>
              <th>{t.activity.details}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, userName }) => (
              <tr key={a.id}>
                <td className="num whitespace-nowrap">{formatDateTime(a.createdAt, locale)}</td>
                <td>{userName}</td>
                <td className="font-medium">{t.auditActions[a.action] ?? a.action}</td>
                <td className="text-muted">{describeAudit(a.details as Record<string, unknown>, locale, { ...t.expenseCategories, ...t.lossReasons })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
