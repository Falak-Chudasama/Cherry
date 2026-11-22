import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cherry: {
          // Primary Brand Red from cherry-icon.svg #FF5252
          flesh: "#FF5252",
          DEFAULT: "#FF5252",
          50: "#FFF5F5",
          100: "#FFE8E8",
          200: "#FFCCCC", // Pastel soft highlight from cherry-icon.svg
          300: "#FFA3A3",
          400: "#FF7070", // Hover/pressed light
          500: "#FF5252",
          600: "#E03E3E", // Pressed accent
          700: "#CB2328", // Strong contrast dark red
          800: "#990F14",
          900: "#6B0508",

          // Vector Pastel Highlight from cherry-icon.svg #FFCCCC
          blush: "#FFCCCC",
          "blush-50": "#FFF9F9",
          "blush-100": "#FFECEC",

          // Organic Stem Leaf Green from cherry-icon.svg #89D66D
          leaf: "#89D66D",
          "leaf-50": "#F5FCF2",
          "leaf-100": "#E6F8DF",
          "leaf-600": "#6FBA53",
          "leaf-700": "#54983C",

          // Contrast neutrals
          ink: "#111827",
          "ink-600": "#374151",
          "ink-muted": "#6B7280",
          surface: "#FDF8F8",
        },
        routine: {
          DEFAULT: "#A855F7",
          subtle: "rgba(168, 85, 247, 0.12)",
          text: "#9333EA",
        },
        must: {
          DEFAULT: "#EF4444",
          subtle: "rgba(239, 68, 68, 0.12)",
          text: "#DC2626",
        },
        should: {
          DEFAULT: "#10B981",
          subtle: "rgba(16, 185, 129, 0.12)",
          text: "#059669",
        },
        stone: {
          750: "#34322e",
          850: "#1f1e1b",
        },
        canvas: {
          light: "#F8F9F5",
          dark: "#121310",
        },
        surface: {
          light: "#FFFFFF",
          dark: "#181915",
          elevatedDark: "#1C1D18",
          wellDark: "#141512",
        },
        ink: {
          primaryLight: "#1C1917",
          primaryDark: "#F3F4F1",
          secondaryLight: "#57534E",
          secondaryDark: "#A8A29E",
          mutedLight: "#78716C",
          mutedDark: "#78716C",
        },
      },
      fontFamily: {
        sans: ['"Host Grotesk"', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['"Unbounded"', 'sans-serif'],
        heading: ['"Host Grotesk"', 'sans-serif'],
      },
      fontSize: {
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }],
        '2xs': ['0.6875rem', { lineHeight: '0.9375rem' }],
      },
      borderRadius: {
        card: "1.25rem",
        capsule: "9999px",
        lg: "8px",
        xl: "12px",
        xxl: "16px",
        xxxl: "24px",
      },
      boxShadow: {
        soft: "0 4px 20px -2px rgba(0, 0, 0, 0.05)",
        lift: "0 12px 32px -4px rgba(0, 0, 0, 0.09)",
        floating: "0 8px 30px -4px rgba(0, 0, 0, 0.08), 0 2px 8px -2px rgba(0, 0, 0, 0.04)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "scale-in": "scale-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 0.18s ease-out",
        "pulse-subtle": "pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
