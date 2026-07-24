/* Browser push subscribe/unsubscribe flow.
 *
 * "Enabled" means three things at once: notification permission granted,
 * a service worker registered, and the browser's push subscription saved on
 * our backend. enablePush()/disablePush() keep all three in sync. */
import { apiFetch } from "@/lib/api";

// "unsupported" = this browser can't do push at all (e.g. iOS Safari outside
// a Home Screen app). "unavailable" = the browser could, but the server has no
// VAPID keys configured, so there's nothing to subscribe to.
export type PushState = "unsupported" | "unavailable" | "denied" | "on" | "off";

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// The VAPID public key arrives base64url-encoded; subscribe() wants raw bytes.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) return "on";
  const { enabled } = await apiFetch<{ enabled: boolean }>(
    "/api/notifications/push/public-key"
  );
  return enabled ? "off" : "unavailable";
}

export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";

  const { key, enabled } = await apiFetch<{ key: string; enabled: boolean }>(
    "/api/notifications/push/public-key"
  );
  if (!enabled) return "unavailable"; // server has no VAPID keys configured

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    }));

  await apiFetch("/api/notifications/push/subscribe", {
    method: "POST",
    body: JSON.stringify(sub.toJSON()),
  });
  return "on";
}

// Backstop for push reliability: run on every app open. If the user already
// granted permission, silently make sure a live subscription exists and the
// backend knows about it. This heals two drift cases that otherwise leave the
// user with no push until they manually re-toggle:
//   - the server pruned a stale subscription (after a 410) but the browser
//     still has permission, so we simply re-register;
//   - the browser rotated the subscription while the app was closed (the
//     pushsubscriptionchange handler is the live path; this is the catch-up).
// It never prompts and never changes permission — a no-op unless already "on".
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const { key, enabled } = await apiFetch<{ key: string; enabled: boolean }>(
      "/api/notifications/push/public-key"
    );
    if (!enabled || !key) return;

    const reg =
      (await navigator.serviceWorker.getRegistration()) ??
      (await navigator.serviceWorker.register("/sw.js"));
    await navigator.serviceWorker.ready;

    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      }));

    // Idempotent on the backend (upsert by endpoint) — cheap to send each open.
    await apiFetch("/api/notifications/push/subscribe", {
      method: "POST",
      body: JSON.stringify(sub.toJSON()),
    });
  } catch {
    // Never let a background heal surface an error to the user.
  }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  // Tell the backend first — if unsubscribe() ran first and this failed, the
  // server would keep pushing into a dead endpoint until the 410 cleanup.
  await apiFetch("/api/notifications/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
}
