"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isImmersiveRoute } from "@/lib/immersive";

const HIDDEN_ON = ["/", "/login", "/register", "/verify-email", "/forgot-password", "/reset-password"];

const IUS_BLUE   = "#3865a6";
const IUS_YELLOW = "#fae66b";
const CLUBS_BG   = "#1e2d45";
const NAV_PAD    = 8; // matches px-2 = 8px on each side

const NAV = [
  {
    href: "/feed",
    label: "Home",
    activeColor: "#ffffff",
    activeBg: IUS_BLUE,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
      </svg>
    ),
  },
  {
    href: "/qa",
    label: "Q&A",
    activeColor: "#ffffff",
    activeBg: IUS_BLUE,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
      </svg>
    ),
  },
  {
    href: "/clubs",
    label: "Clubs",
    activeColor: "#ffffff",
    activeBg: IUS_BLUE,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      </svg>
    ),
  },
  {
    href: "/messages",
    label: "Messages",
    activeColor: "#ffffff",
    activeBg: IUS_BLUE,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    activeColor: "#ffffff",
    activeBg: IUS_BLUE,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    ),
  },
];

const n = NAV.length;
const PILL_W = 62; // px — pill is narrower than the full item slot

export default function NavBar() {
  const pathname = usePathname();
  const [profileHref, setProfileHref] = useState("/profile");
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Remember the deepest route visited within each section, so tapping a nav tab
  // returns you to where you were (e.g. back into a club chat or a Q&A thread)
  // instead of the section root. NavBar lives in the root layout and never
  // unmounts, so this state survives client-side navigation.
  const [lastRoutes, setLastRoutes] = useState<Record<string, string>>({});
  useEffect(() => {
    const section = NAV.find((item) =>
      item.href === "/profile" ? pathname.startsWith("/profile") : pathname.startsWith(item.href)
    );
    // The Profile tab always points at your own profile, so it isn't remembered.
    if (section && section.href !== "/profile") {
      setLastRoutes((prev) => (prev[section.href] === pathname ? prev : { ...prev, [section.href]: pathname }));
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

  if (HIDDEN_ON.includes(pathname) || isImmersiveRoute(pathname)) return null;

  const activeIndex = NAV.findIndex((item) =>
    item.href === "/profile"
      ? pathname.startsWith("/profile")
      : pathname.startsWith(item.href)
  );
  const activeItem = activeIndex >= 0 ? NAV[activeIndex] : null;

  return (
    <nav
      className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[min(420px,calc(100%-2rem))] z-50 rounded-full"
      style={{
        background: "linear-gradient(160deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.18) 100%)",
        backdropFilter: "blur(32px) saturate(180%) brightness(1.05)",
        WebkitBackdropFilter: "blur(32px) saturate(180%) brightness(1.05)",
        border: "1px solid rgba(255,255,255,0.65)",
        boxShadow:
          "inset 0 1.5px 0 rgba(255,255,255,0.90)," +   /* top rim highlight */
          "inset 0 -1px 0 rgba(0,0,0,0.04)," +           /* bottom subtle edge */
          "inset 1px 0 rgba(255,255,255,0.45)," +         /* left edge */
          "inset -1px 0 rgba(255,255,255,0.35)," +        /* right edge */
          "0 8px 32px rgba(0,0,0,0.10)," +               /* outer shadow */
          "0 1px 3px rgba(0,0,0,0.06)",                  /* tight shadow */
      }}
    >
      <div className="relative flex py-2 px-2">
        {/* Sliding liquid-glass bubble */}
        {activeItem && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 4,
              bottom: 4,
              left: `calc(${NAV_PAD}px + (${activeIndex} + 0.5) * (100% - ${NAV_PAD * 2}px) / ${n} - ${PILL_W / 2}px)`,
              width: PILL_W,
              borderRadius: 9999,
              background: "linear-gradient(160deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.22) 100%)",
              border: "1px solid rgba(255,255,255,0.75)",
              boxShadow:
                "inset 0 1.5px 0 rgba(255,255,255,0.95)," +   /* top rim — catches the light */
                "inset 0 -1px 0 rgba(0,0,0,0.06)," +           /* bottom subtle shadow */
                "inset 1px 0 rgba(255,255,255,0.5)," +          /* left rim */
                "inset -1px 0 rgba(255,255,255,0.4)," +         /* right rim */
                "0 4px 20px rgba(0,0,0,0.10)",                  /* outer drop shadow */
              transition:
                "left 0.52s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          />
        )}

        {NAV.map((item, i) => {
          const active = i === activeIndex;
          // Active tab → section root (tap again to pop to the top). Inactive tab →
          // the remembered route so you land back where you left off. Profile is
          // always your own profile.
          const href =
            item.href === "/profile"
              ? profileHref
              : active
                ? item.href
                : lastRoutes[item.href] ?? item.href;
          const showDot = item.href === "/messages" && unreadMessages > 0;

          return (
            <Link
              key={item.href}
              href={href}
              className="relative z-10 flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium rounded-full py-1.5"
              style={{
                color: active ? item.activeBg : "#74777e",
                transition: "color 0.3s ease",
              }}
            >
              <div className="relative">
                {item.icon}
                {showDot && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 border-2 border-white" />
                )}
              </div>
              <span className={cn(active && "font-semibold")}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
