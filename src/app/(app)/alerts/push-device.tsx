"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendTestAlert, subscribePush, unsubscribePush } from "@/actions/alerts";
import { useI18n } from "@/i18n/client";

type Status = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// Same worker as the offline POS, which only runs in production builds.
const workerEnabled = process.env.NODE_ENV === "production";

async function registration() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

export function PushDevice({ publicKey }: { publicKey: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (!workerEnabled || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhone only allows notifications for sites added to the home screen.
        setStatus(ios && !standalone ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setStatus("denied");
      const sub = await (await registration()).pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    })().catch(() => setStatus("unsupported"));
  }, []);

  const enable = () =>
    start(async () => {
      setMessage("");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setStatus(permission === "denied" ? "denied" : "off");
      const reg = await registration();
      const existing = await reg.pushManager.getSubscription();
      // A subscription made with other keys (e.g. another server) can't be reused.
      if (existing) await existing.unsubscribe();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      const res = await subscribePush(sub.toJSON());
      if (res?.ok) {
        setStatus("on");
        router.refresh();
      } else setMessage(t.errors.generic);
    });

  const disable = () =>
    start(async () => {
      setMessage("");
      const sub = await (await registration()).pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
      router.refresh();
    });

  const test = () =>
    start(async () => {
      const res = await sendTestAlert();
      setMessage(res?.delivered ? t.alerts.testSent : t.alerts.testNone);
    });

  if (status === "loading") return <p className="text-sm text-muted">…</p>;
  if (status === "unsupported") return <p className="text-sm text-muted">{t.alerts.unsupported}</p>;
  if (status === "ios-install") return <p className="text-sm">{t.alerts.iosInstall}</p>;
  if (status === "denied") return <p className="text-sm text-red-600">{t.alerts.denied}</p>;

  return (
    <div className="space-y-3">
      <p className={`text-sm ${status === "on" ? "text-brand-700" : "text-muted"}`}>
        {status === "on" ? `✓ ${t.alerts.enabled}` : t.alerts.notEnabled}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {status === "on" ? (
          <>
            <button className="btn-primary" onClick={test} disabled={pending}>{t.alerts.test}</button>
            <button className="btn-secondary" onClick={disable} disabled={pending}>{t.alerts.disable}</button>
          </>
        ) : (
          <button className="btn-primary" onClick={enable} disabled={pending}>{t.alerts.enable}</button>
        )}
      </div>
      {message && <p className="text-sm text-muted">{message}</p>}
    </div>
  );
}
