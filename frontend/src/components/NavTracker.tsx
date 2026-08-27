"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { pushPath } from "@/lib/navHistory";

export default function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    pushPath(pathname);
  }, [pathname]);
  return null;
}
