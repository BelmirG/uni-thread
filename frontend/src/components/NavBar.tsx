"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

const HIDDEN_ON = ["/", "/login", "/register", "/verify-email", "/forgot-password", "/reset-password"];

const NAV = [
  {
    href: "/feed",
    label: "Feed",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
    ),
  },
  {
    href: "/qa",
    label: "Q&A",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
      </svg>
    ),
  },
  {
    href: "/clubs",
    label: "Clubs",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      </svg>
    ),
  },
  {
    href: "/messages",
    label: "Messages",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    ),
  },
];

export default function NavBar() {
  const pathname = usePathname();
  const [profileHref, setProfileHref] = useState("/profile");
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Remember last visited path per section so the nav returns you there
  const [lastPaths, setLastPaths] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    const result: Record<string, string> = {};
    for (const item of NAV) {
      const stored = sessionStorage.getItem(`nav_last_${item.href}`);
      if (stored) result[item.href] = stored;
    }
    return result;
  });

  useEffect(() => {
    for (const item of NAV) {
      if (pathname.startsWith(item.href)) {
        sessionStorage.setItem(`nav_last_${item.href}`, pathname);
        setLastPaths((prev) => ({ ...prev, [item.href]: pathname }));
        break;
      }
    }
  }, [pathname]);

  useEffect(() => {
    if (HIDDEN_ON.includes(pathname)) return;
    apiFetch<{ username: string }>("/api/auth/me")
      .then((me) => setProfileHref(`/profile/${me.username}`))
      .catch(() => setProfileHref("/profile"));
  }, [pathname]);

  useEffect(() => {
    function fetchUnread() {
      apiFetch<{ count: number }>("/api/messages/unread-count")
        .then((d) => setUnreadMessages(d.count))
        .catch(() => {});
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, [pathname]);

  if (HIDDEN_ON.includes(pathname)) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-sm border-t border-border z-50">
      <div className="max-w-xl mx-auto h-full flex">
        {NAV.map((item) => {
          const href =
            item.href === "/profile"
              ? profileHref
              : (lastPaths[item.href] ?? item.href);
          const active =
            item.href === "/profile"
              ? pathname.startsWith("/profile")
              : pathname.startsWith(item.href);
          const showDot = item.href === "/messages" && unreadMessages > 0;

          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                {item.icon}
                {showDot && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-destructive border-2 border-white" />
                )}
              </div>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
