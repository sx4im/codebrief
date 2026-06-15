import type { Config } from "tailwindcss";

// Design system per DESIGN.md (Replicate warm-cream / hot-orange editorial).
// The legacy semantic names (background/panel/panel2/border/text/muted) are kept
// and remapped onto the cream palette so existing components flip coherently;
// the DESIGN.md-named tokens (canvas/bone/ink/primary/...) are the going-forward set.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces
        canvas: "#f9f7f3",
        bone: "#f3f0e8",
        card: "#ffffff",
        "surface-dark": "#202020",
        "surface-deep": "#000000",
        // Text
        ink: "#202020",
        body: "#3a3a3a",
        charcoal: "#575757",
        mute: "#646464",
        ash: "#8d8d8d",
        stone: "#bbbbbb",
        "on-dark": "#fcfcfc",
        "on-dark-mute": "rgba(252,252,252,0.72)",
        // Brand (use scarcely — CTA, hero, links)
        primary: {
          DEFAULT: "#ea2804",
          deep: "#c01f00",
          glow: "#ff6a3d",
          pink: "#f4a8a0",
        },
        // Functional / semantic
        focus: "#3b82f6",
        success: "#2b9a66",
        // Severity palette for data viz (darkened so it reads on cream/white)
        severity: {
          critical: "#c01f00",
          high: "#d2541b",
          medium: "#b45309",
          low: "#2b9a66",
        },
        // Legacy semantic names → cream system
        background: "#f9f7f3",
        panel: "#ffffff",
        panel2: "#f3f0e8",
        border: "rgba(32,32,32,0.12)",
        "border-strong": "rgba(32,32,32,0.9)",
        text: "#202020",
        muted: "#646464",
        blue: "#3b82f6",
        amber: "#b45309",
        danger: "#c01f00",
      },
      fontFamily: {
        display: ["var(--font-display)", "Bricolage Grotesque", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "Geist", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "10px",
        none: "0px",
        xs: "4px",
        sm: "6px",
        md: "10px",
        lg: "16px",
        full: "9999px",
      },
      maxWidth: {
        content: "1280px",
      },
      boxShadow: {
        soft: "0 8px 24px rgba(32,32,32,0.08)",
        card: "0 1px 2px rgba(32,32,32,0.06)",
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
    },
  },
  plugins: [],
};

export default config;
