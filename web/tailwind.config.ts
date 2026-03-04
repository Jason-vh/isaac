import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        surface: {
          0: "#FFFFFF",
          1: "#FAFAF8",
          2: "#F5F5F0",
          3: "#EEEEE8",
        },
        ink: {
          DEFAULT: "#1A1A1A",
          muted: "#6B6B6B",
          faint: "#A3A3A0",
        },
        border: {
          DEFAULT: "#E5E5E0",
          strong: "#D4D4CF",
        },
        accent: {
          DEFAULT: "#E07A2F",
          light: "#FEF3E2",
        },
        activity: {
          ticket: "#059669",
          mr: "#7C3AED",
          meeting: "#0284C7",
          doc: "#EA580C",
          win: "#D97706",
          comment: "#6B7280",
          status: "#3B82F6",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
        "card-hover":
          "0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
    },
  },
} satisfies Config;
