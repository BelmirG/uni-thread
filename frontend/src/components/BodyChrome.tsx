"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isImmersiveRoute } from "@/lib/immersive";
import { syncPushSubscription } from "@/lib/push";

export default function BodyChrome() {
  const pathname = usePathname();
  const immersive = isImmersiveRoute(pathname);

  useEffect(() => {
    document.body.style.paddingBottom = immersive ? "0px" : "";
    return () => { document.body.style.paddingBottom = ""; };
  }, [immersive]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    syncPushSubscription();
    const onVisible = () => {
      if (document.visibilityState === "visible") syncPushSubscription();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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
