/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#06070a",
        panel: "#0d1017",
        "panel-2": "#12161f",
        gline: "#1e2430",
        turkish: {
          DEFAULT: "#0ea5c4",
          deep: "#075e73",
          bright: "#37c8e6",
          tint: "#eaf8fb",
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
