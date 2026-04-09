/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "var(--page-bg)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        border: "var(--border)",
        surface: "var(--surface)",
        "surface-elev": "var(--surface-elev)",
        primary: "var(--primary)",
        "primary-ink": "var(--primary-ink)",
        ring: "var(--ring)",
        sb: {
          bg: "var(--sb-bg)",
          "bg-2": "var(--sb-bg-2)",
          text: "var(--sb-text)",
          muted: "var(--sb-muted)",
          hover: "var(--sb-hover)",
          pill: "var(--sb-pill)",
        },
        field: "var(--field-bg)",
      },
      borderRadius: {
        r: "var(--radius)",
        r3xl: "var(--radius-3xl)",
      },
      boxShadow: {
        card: "var(--shadow)",
        sb: "var(--sb-shadow)",
      },
      spacing: {
        pagepad: "var(--page-pad)",
      },
      maxWidth: {
        pagemax: "var(--page-max)",
      },
    },
  },
  plugins: [],
};
