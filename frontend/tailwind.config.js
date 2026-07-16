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

        // Apple-minimal surface scale, driven by CSS variables (globals.css)
        // so the .dark class on <html> re-skins every page live.
        "surface":                    "rgb(var(--surface) / <alpha-value>)",
        "surface-dim":                "rgb(var(--surface-dim) / <alpha-value>)",
        "surface-bright":             "rgb(var(--surface-bright) / <alpha-value>)",
        "surface-container-lowest":   "rgb(var(--surface-container-lowest) / <alpha-value>)",
        "surface-container-low":      "rgb(var(--surface-container-low) / <alpha-value>)",
        "surface-container":          "rgb(var(--surface-container) / <alpha-value>)",
        "surface-container-high":     "rgb(var(--surface-container-high) / <alpha-value>)",
        "surface-container-highest":  "rgb(var(--surface-container-highest) / <alpha-value>)",
        "surface-variant":            "rgb(var(--surface-variant) / <alpha-value>)",
        "on-surface":                 "rgb(var(--on-surface) / <alpha-value>)",
        "on-surface-variant":         "rgb(var(--on-surface-variant) / <alpha-value>)",
        "outline":                    "rgb(var(--outline) / <alpha-value>)",
        "outline-variant":            "rgb(var(--outline-variant) / <alpha-value>)",
        "inverse-surface":            "rgb(var(--inverse-surface) / <alpha-value>)",
        "inverse-on-surface":         "rgb(var(--inverse-on-surface) / <alpha-value>)",
        "error":                      "rgb(var(--error-rgb) / <alpha-value>)",
        "error-container":            "rgb(var(--error-container-rgb) / <alpha-value>)",
        "on-error":                   "rgb(var(--on-error-rgb) / <alpha-value>)",
        "on-error-container":         "rgb(var(--on-error-container-rgb) / <alpha-value>)",
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
