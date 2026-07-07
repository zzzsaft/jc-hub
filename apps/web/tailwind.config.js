/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "rgb(var(--color-bg-app) / <alpha-value>)",
          panel: "rgb(var(--color-bg-panel) / <alpha-value>)",
          muted: "rgb(var(--color-bg-muted) / <alpha-value>)",
          raised: "rgb(var(--color-bg-raised) / <alpha-value>)",
        },
        brand: {
          50: "rgb(var(--color-brand-50) / <alpha-value>)",
          100: "rgb(var(--color-brand-100) / <alpha-value>)",
          200: "rgb(var(--color-brand-200) / <alpha-value>)",
          500: "rgb(var(--color-brand-500) / <alpha-value>)",
          600: "rgb(var(--color-brand-600) / <alpha-value>)",
          700: "rgb(var(--color-brand-700) / <alpha-value>)",
        },
        line: {
          subtle: "rgb(var(--color-line-subtle) / <alpha-value>)",
          DEFAULT: "rgb(var(--color-line-default) / <alpha-value>)",
          strong: "rgb(var(--color-line-strong) / <alpha-value>)",
        },
        text: {
          primary: "rgb(var(--color-text-primary) / <alpha-value>)",
          secondary: "rgb(var(--color-text-secondary) / <alpha-value>)",
          muted: "rgb(var(--color-text-muted) / <alpha-value>)",
          inverse: "rgb(var(--color-text-inverse) / <alpha-value>)",
        },
        state: {
          success: "rgb(var(--color-success-600) / <alpha-value>)",
          successBg: "rgb(var(--color-success-50) / <alpha-value>)",
          warning: "rgb(var(--color-warning-600) / <alpha-value>)",
          warningBg: "rgb(var(--color-warning-50) / <alpha-value>)",
          danger: "rgb(var(--color-danger-600) / <alpha-value>)",
          dangerBg: "rgb(var(--color-danger-50) / <alpha-value>)",
          info: "rgb(var(--color-info-600) / <alpha-value>)",
          infoBg: "rgb(var(--color-info-50) / <alpha-value>)",
        },
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
  plugins: [],
};
