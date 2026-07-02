/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn CSS-var tokens (used by UI components)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // Apple-minimal surface scale: pure white cards on a warm-grey canvas,
        // hairline outlines that read as depth rather than lines.
        "surface":                    "#ffffff",
        "surface-dim":                "#e8e8ed",
        "surface-bright":             "#ffffff",
        "surface-container-lowest":   "#ffffff",
        "surface-container-low":      "#f5f5f7",
        "surface-container":          "#efeff1",
        "surface-container-high":     "#e8e8ed",
        "surface-container-highest":  "#e3e3e8",
        "surface-variant":            "#e8e8ed",
        "on-surface":                 "#1d1d1f",
        "on-surface-variant":         "#6e6e73",
        "outline":                    "#86868b",
        "outline-variant":            "#e8e8ed",
        "inverse-surface":            "#2f3033",
        "inverse-on-surface":         "#f2f0f3",
        "error":                      "#ba1a1a",
        "error-container":            "#ffdad6",
        "on-error":                   "#ffffff",
        "on-error-container":         "#93000a",
        "primary-fixed":              "#d2e4ff",
        "primary-fixed-dim":          "#b0c8eb",
        "on-primary-fixed":           "#001c37",
        "on-primary-fixed-variant":   "#314865",
        "primary-container":          "#0a2540",
        "on-primary-container":       "#768dad",
        "inverse-primary":            "#b0c8eb",
        "secondary-fixed":            "#c6e7ff",
        "secondary-fixed-dim":        "#81cfff",
        "on-secondary-fixed":         "#001e2d",
        "on-secondary-fixed-variant": "#004c6b",
        "secondary-container":        "#41befd",
        "on-secondary-container":     "#004b69",
        "on-secondary":               "#ffffff",
        "tertiary-fixed":             "#ffdea0",
        "tertiary-fixed-dim":         "#f7be33",
        "on-tertiary":                "#ffffff",
        "surface-tint":               "#49607e",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // squircle-feel radii — noticeably rounder than stock Tailwind
        xl: "1.125rem",
        "2xl": "1.375rem",
      },
      boxShadow: {
        // soft, diffuse Apple-style elevation instead of hard edges
        sm: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
        md: "0 2px 4px rgba(0,0,0,0.04), 0 8px 28px rgba(0,0,0,0.06)",
      },
      fontFamily: {
        "headline": ["-apple-system", "BlinkMacSystemFont", '"SF Pro Display"', '"Segoe UI"', "sans-serif"],
        "body":     ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', '"Segoe UI"', "sans-serif"],
      },
      fontSize: {
        "headline-xl": ["40px", { lineHeight: "48px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "headline-lg": ["32px", { lineHeight: "40px", fontWeight: "600" }],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "body-lg":     ["18px", { lineHeight: "28px", fontWeight: "400" }],
        "body-md":     ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "body-sm":     ["14px", { lineHeight: "20px", fontWeight: "400" }],
        "label-md":    ["14px", { lineHeight: "20px", letterSpacing: "0.05em", fontWeight: "600" }],
        "label-sm":    ["12px", { lineHeight: "16px", fontWeight: "500" }],
      },
    },
  },
  plugins: [],
};
