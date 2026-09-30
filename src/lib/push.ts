import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appState, pushSubscriptions } from "@/db/schema";

// Not marked server-only: the alert worker imports it from instrumentation.

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export async function getState<T>(key: string): Promise<T | undefined> {
  const [row] = await db.select().from(appState).where(eq(appState.key, key));
  return row?.value as T | undefined;
}

export async function setState(key: string, value: unknown) {
  await db.insert(appState).values({ key, value }).onConflictDoUpdate({ target: appState.key, set: { value } });
}

type Vapid = { publicKey: string; privateKey: string };

/** The server's push keys, created on first use so no setup is needed. */
export async function getVapidKeys(): Promise<Vapid> {
  const existing = await getState<Vapid>("push.vapid");
  if (existing) return existing;
  const keys = webpush.generateVAPIDKeys();
  // Two requests racing here must end up with the same keys.
  await db.insert(appState).values({ key: "push.vapid", value: keys }).onConflictDoNothing();
  return (await getState<Vapid>("push.vapid"))!;
}

/** Sends a notification to every device of these users. Returns how many were delivered. */
export async function sendPush(userIds: number[], payload: PushPayload, urgent = false): Promise<number> {
  if (userIds.length === 0) return 0;
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
  if (subs.length === 0) return 0;

  const { publicKey, privateKey } = await getVapidKeys();
  // Push services require a contact; the site's own address is enough.
  const subject = process.env.VAPID_SUBJECT || (await getState<string>("push.subject")) || "mailto:admin@example.com";
  const body = JSON.stringify(payload);
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          vapidDetails: { subject, publicKey, privateKey },
          TTL: 24 * 3600,
          urgency: urgent ? "high" : "normal",
        });
        delivered++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // The browser dropped this subscription (app uninstalled, permission revoked…).
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        } else {
          console.error("Push failed", s.id, status ?? e);
        }
      }
    }),
  );
  return delivered;
}
