/* UniThread service worker — receives Web Push messages and shows system
 * notifications. Payloads are the same JSON the in-app toasts use, so the
 * text/link logic below mirrors ToastProvider.tsx. */

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
  if ((p.type === "club_join_request" || p.type === "club_approved" || p.type === "club_role") && p.club_slug) return "/clubs/" + p.club_slug;
  if (p.type === "club_invite") return "/profile";
  if (p.actor_username) return "/profile/" + p.actor_username;
  return "/feed";
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let p;
  try { p = event.data.json(); } catch { return; }

  event.waitUntil((async () => {
    // If a tab is open and visible, the in-app toast already handles it —
    // a second system banner would be duplicate noise.
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (tabs.some((t) => t.visibilityState === "visible")) return;

    const { title, body } = describe(p);
    await self.registration.showNotification(title, {
      body,
      data: { url: targetUrl(p) },
      // Collapse repeated pushes from the same conversation into one banner.
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
