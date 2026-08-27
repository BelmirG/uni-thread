"use client";

import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";

type VTDocument = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;

    const apply = () => {
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem("theme", next ? "dark" : "light");
      } catch {}
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", next ? "#111112" : "#ffffff");
      setDark(next);
    };

    const doc = document as VTDocument;
    const el = btnRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || !el || reduceMotion) {
      apply();
      return;
    }

    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = doc.startViewTransition(apply);
    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${radius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 550,
            easing: "cubic-bezier(0.4, 0, 0.2, 1)",
            pseudoElement: "::view-transition-new(root)",
          }
        );
      })
      .catch(() => {});
  }

  return (
    <button
      ref={btnRef}
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
    >
      <span className="relative block w-5 h-5">
        <Sun
          className={
            "absolute inset-0 w-5 h-5 transition-all duration-500 " +
            (dark ? "opacity-0 scale-0 -rotate-90" : "opacity-100 scale-100 rotate-0")
          }
        />
        <Moon
          className={
            "absolute inset-0 w-5 h-5 transition-all duration-500 " +
            (dark ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-0 rotate-90")
          }
        />
      </span>
    </button>
  );
}
