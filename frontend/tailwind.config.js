/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          bg: "#080c16",
          panel: "#0d1424",
          card: "#111a2e",
          border: "#1c2740",
          hover: "#16213a",
        },
        accent: {
          cyan: "#22d3ee",
          blue: "#3b82f6",
          purple: "#8b5cf6",
        },
        status: {
          healthy: "#22c55e",
          faulty: "#ef4444",
          recovering: "#f59e0b",
          offline: "#64748b",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        glow: "0 0 24px rgba(34, 211, 238, 0.15)",
      },
    },
  },
  plugins: [],
};
