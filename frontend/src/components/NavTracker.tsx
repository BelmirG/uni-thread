"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pushPath } from "@/lib/navHistory";

// Records each visited path so detail pages can offer a context-aware "Back".
export default function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    pushPath(pathname);
  }, [pathname]);
  return null;
}
