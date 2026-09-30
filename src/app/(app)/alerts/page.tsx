import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { alertSettings, pushSubscriptions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ALERT_KINDS } from "@/lib/alerts";
import { getVapidKeys } from "@/lib/push";
import { removeDevice } from "@/actions/alerts";
import { getDict } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { PushDevice } from "./push-device";
import { AlertSettingsForm } from "./settings-form";

export default async function AlertsPage() {
  const user = await requireUser("OWNER");
  const { t, locale } = await getDict();
  const { publicKey } = await getVapidKeys();
  const devices = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, user.id))
    .orderBy(desc(pushSubscriptions.createdAt));
  const [settings] = await db.select().from(alertSettings).where(eq(alertSettings.userId, user.id));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t.alerts.title} />
      <p className="text-sm text-muted">{t.alerts.help}</p>

      <div className="card p-5">
        <h2 className="mb-3 font-bold">{t.alerts.thisDevice}</h2>
        <PushDevice publicKey={publicKey} />
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-bold">{t.alerts.devices}</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-muted">{t.alerts.noDevices}</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{d.device || "—"}</span>{" "}
                  <span className="num text-muted">{formatDateTime(d.createdAt, locale)}</span>
                </span>
                <form action={removeDevice}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="btn-secondary px-3 py-1">{t.alerts.remove}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-5">
        <h2 className="mb-1 font-bold">{t.alerts.settings}</h2>
        <p className="mb-4 text-sm text-muted">{t.alerts.settingsHelp}</p>
        <AlertSettingsForm
          kinds={[...ALERT_KINDS]}
          muted={settings?.muted ?? ["login"]}
          cashThreshold={settings?.cashThreshold ?? 1000}
        />
      </div>
    </div>
  );
}
