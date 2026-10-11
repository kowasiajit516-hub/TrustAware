/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // ---------------------------------------------------------
        // Dashboard theme - professional dark SaaS palette
        // ---------------------------------------------------------
        base: {
          bg: "#0F172A",
          panel: "#111827",
          card: "#111827",
          border: "#243244",
          hover: "#1E293B",
          ink: "#F8FAFC",
        },
        accent: {
          cyan: "#38BDF8",
          blue: "#2563EB",
          purple: "#1D4ED8",
        },
        status: {
          healthy: "#22C55E",
          faulty: "#EF4444",
          recovering: "#F59E0B",
          offline: "#64748B",
        },
        // ---------------------------------------------------------
        // Auth theme - dark navy / electric blue (login/register/
        // forgot/reset only - never used on dashboard pages)
        // ---------------------------------------------------------
        auth: {
          bg: "#04060c",
          panel: "#070b16",
          panel2: "#0b1226",
          border: "#1c2b4a",
          blue: "#2563eb",
          blueLight: "#60a5fa",
          blueDark: "#1d4ed8",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      boxShadow: {
        glow: "0 0 24px rgba(105, 117, 101, 0.18)",
        authGlow: "0 0 70px rgba(37, 99, 235, 0.35)",
      },
    },
  },
  plugins: [],
};
