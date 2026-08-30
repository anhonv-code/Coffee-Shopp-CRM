import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        coffee: {
          50: "#f7f3ee",
          100: "#e9ddcf",
          200: "#d6bfa2",
          300: "#c09d74",
          400: "#a97f4f",
          500: "#8b5e34",
          600: "#6f4a29",
          700: "#573a21",
          800: "#3f2a18",
          900: "#2a1c10",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
