import type { Config } from "tailwindcss";

// Design system per DESIGN.md (Nike: photography-first, near-monochrome editorial).
// Chrome is pure black/white/single-gray with red reserved for "sale"/critical
// signal only. Legacy semantic names (background/panel/border/text/muted) are kept
// and remapped onto the Nike palette so existing components flip coherently.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces — pure white canvas, single soft-cloud gray
        canvas: "#ffffff",
        bone: "#f5f5f5", // soft-cloud: the "studio" gray behind content blocks
        card: "#ffffff",
        "surface-dark": "#111111", // ink block (CTA band, member cards)
        "surface-deep": "#000000",
        // Text ramp (Nike ink → stone)
        ink: "#111111",
        body: "#39393b", // charcoal
        charcoal: "#4b4b4d", // ash
        mute: "#707072",
        ash: "#9e9ea0", // stone
        stone: "#cacacb", // hairline
        "on-dark": "#ffffff",
        "on-dark-mute": "rgba(255,255,255,0.72)",
        // Brand: Nike's only "color" is black. No decorative accent — primary IS ink.
        primary: {
          DEFAULT: "#111111",
          deep: "#000000",
          glow: "#39393b",
          pink: "#707072",
        },
        // Functional / semantic
        focus: "#1151ff", // info blue
        success: "#007d48",
        // Severity ramp for data-viz badges (a signal scale, like sale/success —
        // the one place hue is allowed beyond chrome; tuned to read on white).
        severity: {
          critical: "#d30005", // sale red
          high: "#a8200a",
          medium: "#b45309",
          low: "#007d48", // success green
        },
        // Legacy semantic names → Nike system
        background: "#ffffff",
        panel: "#ffffff",
        panel2: "#f5f5f5",
        border: "#e5e5e5", // hairline-soft
        "border-strong": "#111111",
        text: "#111111",
        muted: "#707072",
        blue: "#1151ff",
        amber: "#b45309",
        danger: "#d30005",
      },
      fontFamily: {
        // Headings use a clean Helvetica-Now substitute (Inter); the towering
        // uppercase campaign tier uses a condensed display (Anton).
        display: ["var(--font-display)", "Inter", "system-ui", "sans-serif"],
        campaign: ["var(--font-campaign)", "Anton", "Impact", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        // Nike: every container is rounded-none; only CTAs/chips are full pills.
        DEFAULT: "0px",
        none: "0px",
        xs: "0px",
        sm: "0px",
        md: "0px",
        lg: "0px",
        full: "9999px",
      },
      maxWidth: {
        content: "1440px", // Nike content area
      },
      boxShadow: {
        // Nike chrome is flat — no drop shadows. Hairline borders carry separation.
        soft: "none",
        card: "none",
      },
      letterSpacing: {
        tightest: "-0.02em",
      },
    },
  },
  plugins: [],
};

export default config;
