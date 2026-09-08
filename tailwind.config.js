/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#090d16",
        surface: "#111827",
        "surface-card": "#1e293b",
        primary: {
          50: "#eef2ff",
          100: "#e0e7ff",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
        danger: {
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
        },
        success: {
          500: "#10b981",
          600: "#059669",
        }
      },
    },
  },
  plugins: [],
}
