"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { alertSettings, pushSubscriptions } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ALERT_KINDS } from "@/lib/alerts";
import { sendPush, setState } from "@/lib/push";
import { toCents } from "@/lib/format";
import { getDict } from "@/i18n/server";

type State = { error?: string; ok?: boolean; delivered?: number } | undefined;

const subscriptionInput = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/** A short device label from the user agent, e.g. "Android · Chrome". */
function deviceName(ua: string) {
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [os, browser].filter(Boolean).join(" · ");
}

async function ensureSettings(userId: number) {
  const { locale } = await getDict();
  await db.insert(alertSettings).values({ userId, locale }).onConflictDoUpdate({ target: alertSettings.userId, set: { locale } });
}

export async function subscribePush(sub: unknown): Promise<State> {
  const user = await requireUser("OWNER");
  const parsed = subscriptionInput.safeParse(sub);
  if (!parsed.success) return { error: "generic" };
  const { endpoint, keys } = parsed.data;
  const h = await headers();
  const device = deviceName(h.get("user-agent") ?? "");
  await db
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, device })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, device } });
  // Push services want a contact for the sender: the site's own address.
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host && !host.startsWith("localhost")) await setState("push.subject", `https://${host}`);
  await ensureSettings(user.id);
  revalidatePath("/alerts");
  return { ok: true };
}

export async function unsubscribePush(endpoint: string): Promise<State> {
  const user = await requireUser("OWNER");
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)));
  revalidatePath("/alerts");
  return { ok: true };
}

export async function removeDevice(formData: FormData) {
  const user = await requireUser("OWNER");
  const id = Number(formData.get("id"));
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.userId, user.id)));
  revalidatePath("/alerts");
}

export async function sendTestAlert(): Promise<State> {
  const user = await requireUser("OWNER");
  const { t } = await getDict();
  const delivered = await sendPush([user.id], { title: t.alerts.testTitle, body: t.alerts.testBody, url: "/alerts", tag: "test" });
  return { ok: true, delivered };
}

export async function saveAlertSettings(_prev: State, formData: FormData): Promise<State> {
  const user = await requireUser("OWNER");
  const muted = ALERT_KINDS.filter((k) => formData.get(k) !== "on");
  const cashThreshold = toCents(String(formData.get("cashThreshold") ?? "0") || "0");
  if (!Number.isFinite(cashThreshold) || cashThreshold < 0) return { error: "amount" };
  const { locale } = await getDict();
  await db
    .insert(alertSettings)
    .values({ userId: user.id, muted, cashThreshold, locale })
    .onConflictDoUpdate({ target: alertSettings.userId, set: { muted, cashThreshold, locale } });
  revalidatePath("/alerts");
  return { ok: true };
}
