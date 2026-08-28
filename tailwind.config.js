/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // These read from CSS custom properties (set in src/index.css and
        // kept live by applyTheme() in App.jsx) instead of fixed hex, so
        // Settings -> Theme can recolor every bg-ink / text-turkish /
        // border-gline element in the app, not just the sidebar gradient.
        ink: "var(--gt-ink)",
        panel: "var(--gt-panel)",
        "panel-2": "var(--gt-panel-2)",
        gline: "var(--gt-line)",
        turkish: {
          DEFAULT: "var(--gt-blue)",
          deep: "var(--gt-blue-deep)",
          bright: "var(--gt-blue-bright)",
          tint: "var(--gt-blue-tint)",
        },
      },
      fontFamily: {
        display: ["Chakra Petch", "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
