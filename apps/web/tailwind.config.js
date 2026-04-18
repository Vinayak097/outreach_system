/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        ink: {
          primary: "#1a1a1a",
          secondary: "#6b6b6b",
          tertiary: "#9a9a9a",
        },
        surface: {
          primary: "#ffffff",
          secondary: "#f4f3ee",
          tertiary: "#eceae3",
        },
        success: { bg: "#EAF3DE", fg: "#3B6D11" },
        info: { bg: "#E6F1FB", fg: "#185FA5" },
        danger: { bg: "#FCEBEB", fg: "#A32D2D" },
        warning: { bg: "#FAEEDA", fg: "#854F0B" },
      },
      borderColor: {
        DEFAULT: "rgba(0,0,0,0.15)",
      },
      borderRadius: {
        pill: "6px",
        card: "8px",
        page: "12px",
      },
      fontSize: {
        tiny: ["11px", { lineHeight: "1.5" }],
        small: ["12px", { lineHeight: "1.5" }],
        body: ["13px", { lineHeight: "1.5" }],
        h2: ["16px", { lineHeight: "1.5", fontWeight: "500" }],
        h1: ["18px", { lineHeight: "1.5", fontWeight: "500" }],
      },
    },
  },
  plugins: [],
};
