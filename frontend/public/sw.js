
function describe(p) {
  const name = p.actor_display_name || "Someone";
  switch (p.type) {
    case "dm":
      return { title: name, body: p.preview || (p.is_post_share ? "Shared a post" : p.has_photo ? "Photo" : p.has_file ? "File" : "Sent you a message") };
    case "follow":
      return { title: name, body: "Started following you" };
    case "mention":
      return { title: name, body: "Mentioned you in a post" };
    case "reply":
      return { title: name, body: "Replied to your post" };
    case "chat_mention":
      return { title: name, body: "Mentioned you in " + (p.club_name || "a club") + " chat" };
    case "club_chat":
      return { title: p.club_name || "Club chat", body: name + ": " + (p.preview || (p.has_photo ? "Photo" : p.has_file ? "File" : "Sent a message")) };
    case "milestone":
      return { title: "Your post is taking off", body: "It just reached " + p.count + " upvotes" };
    case "qa_answer":
      return { title: "New answer", body: "Your anonymous question got a new answer" };
    case "club_event":
      return { title: p.club_name || "Club event", body: name + " scheduled an event" };
    case "club_invite":
      return { title: name, body: "Invited you to " + (p.club_name || "a club") };
    case "club_join_request":
      return { title: name, body: "Requested to join " + (p.club_name || "your club") };
    case "club_approved":
      return { title: name, body: "Accepted you into " + (p.club_name || "the club") };
    case "club_role":
      return { title: name, body: "Made you a " + (p.role || "moderator") + " of " + (p.club_name || "the club") };
    default:
      return { title: "UniThread", body: "You have a new notification" };
  }
}

function targetUrl(p) {
  if (p.type === "dm" && p.conversation_id) return "/messages/" + p.conversation_id;
  if ((p.type === "mention" || p.type === "reply" || p.type === "milestone") && p.post_id) return "/feed/" + p.post_id;
  if (p.type === "qa_answer" && p.post_id) return "/qa/" + p.post_id;
  if ((p.type === "chat_mention" || p.type === "club_chat") && p.club_slug) return "/clubs/" + p.club_slug + "/chat";
  if ((p.type === "club_join_request" || p.type === "club_approved" || p.type === "club_role" || p.type === "club_event") && p.club_slug) return "/clubs/" + p.club_slug;
  if (p.type === "club_invite") return "/profile";
  if (p.actor_username) return "/profile/" + p.actor_username;
  return "/feed";
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = self.atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil((async () => {
    try {
      const { key, enabled } = await fetch("/api/notifications/push/public-key", {
        credentials: "include",
      }).then((r) => r.json());
      if (!enabled || !key) return;

      const sub =
        event.newSubscription ??
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        }));

      await fetch("/api/notifications/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON ? sub.toJSON() : sub),
      });
    } catch {
    }
  })());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let p;
  try { p = event.data.json(); } catch { return; }

  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (tabs.some((t) => t.visibilityState === "visible")) return;

    const { title, body } = describe(p);
    await self.registration.showNotification(title, {
      body,
      data: { url: targetUrl(p) },
      tag: p.type === "dm" && p.conversation_id ? "dm-" + p.conversation_id
        : p.type === "club_chat" && p.club_slug ? "club-chat-" + p.club_slug
        : undefined,
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/feed";

  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const tab of tabs) {
      if ("focus" in tab) {
        await tab.focus();
        if ("navigate" in tab) await tab.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
