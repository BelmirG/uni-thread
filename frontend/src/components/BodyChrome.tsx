"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isImmersiveRoute } from "@/lib/immersive";

// Zeroes the body's bottom padding (normally pb-24, reserved for the floating
// NavBar) on immersive chat routes, so the chat fills the whole viewport.
export default function BodyChrome() {
  const pathname = usePathname();
  const immersive = isImmersiveRoute(pathname);

  useEffect(() => {
    document.body.style.paddingBottom = immersive ? "0px" : "";
    return () => { document.body.style.paddingBottom = ""; };
  }, [immersive]);

  // Register the service worker on load (not only when push is enabled) so the
  // app is installable as a PWA. Registration is idempotent — if push already
  // registered it, this is a no-op.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // iOS home-screen apps have a long-standing WebKit bug: after the software
  // keyboard closes, touch hit-testing can stay offset from what's rendered,
  // so every tap lands in the wrong place and the app appears frozen until
  // it's force-quit. A 1px scroll round-trip right after an input loses focus
  // forces WebKit to re-sync the viewport, which clears the offset. Only
  // needed (and only run) in standalone display mode.
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    const resync = () => {
      requestAnimationFrame(() => {
        const y = window.scrollY;
        window.scrollTo(0, y + 1);
        window.scrollTo(0, y);
      });
    };
    document.addEventListener("focusout", resync);
    return () => document.removeEventListener("focusout", resync);
  }, []);

  return null;
}
