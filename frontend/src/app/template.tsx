"use client";

import { useState } from "react";

export default function Template({ children }: { children: React.ReactNode }) {
  const [animating, setAnimating] = useState(true);

  return (
    <div
      className={animating ? "page-enter" : undefined}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) setAnimating(false);
      }}
    >
      {children}
    </div>
  );
}
