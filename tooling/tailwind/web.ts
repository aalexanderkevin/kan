import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";
import scrollbar from "tailwind-scrollbar";

export default {
  content: ["./src/**/*.tsx"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-plus-jakarta-sans), Plus Jakarta Sans"],
      },
      fontSize: {
        sm: "0.8rem",
      },
      boxShadow: {
        "3xl-dark": "0px 16px 70px rgba(0, 0, 0, 0.5)",
        "3xl-light":
          "rgba(0, 0, 0, 0.12) 0px 4px 30px, rgba(0, 0, 0, 0.04) 0px 3px 17px, rgba(0, 0, 0, 0.04) 0px 2px 8px, rgba(0, 0, 0, 0.04) 0px 1px 1px",
      },
      animation: {
        "border-spin": "border-spin 4s linear infinite",
        "fade-down": "fade-down 0.5s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        scroll: "scroll 40s linear infinite",
      },

      keyframes: {
        "border-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "fade-down": {
          "0%": {
            opacity: "0",
            transform: "translateY(-20px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0)",
          },
        },
        "fade-in": {
          "0%": {
            opacity: "0",
          },
          "100%": {
            opacity: "1",
          },
        },
        scroll: {
          "0%": {
            transform: "translateX(0)",
          },
          "100%": {
            transform: "translateX(calc(-50% - 1.5rem))",
          },
        },
      },
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9eeff",
          200: "#b9ddff",
          300: "#8bc8ff",
          400: "#58a9f5",
          500: "#2b87df",
          600: "#0f68bd",
          700: "#064f9c",
          800: "#083f7a",
          900: "#0a3465",
        },
        "dark-50": "#161616",
        "dark-100": "#1c1c1c",
        "dark-200": "#232323",
        "dark-300": "#282828",
        "dark-400": "#2e2e2e",
        "dark-500": "#343434",
        "dark-600": "#3e3e3e",
        "dark-700": "#505050",
        "dark-800": "#707070",
        "dark-900": "#7e7e7e",
        "dark-950": "#bbb",
        "dark-1000": "#ededed",
        "light-50": "#ffffff",
        "light-100": "#f5faff",
        "light-200": "#eaf4ff",
        "light-300": "#dbeafe",
        "light-400": "#c8ddf4",
        "light-500": "#b2cce8",
        "light-600": "#9db9d8",
        "light-700": "#7d9ab9",
        "light-800": "#5f7d9d",
        "light-900": "#466581",
        "light-950": "#2b4a66",
        "light-1000": "#102f4d",
      },
      screens: {
        "2xl": "1600px",
      },
    },
  },
  plugins: [forms, scrollbar],
} satisfies Config;
