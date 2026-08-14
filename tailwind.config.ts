import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F2FAF5",
        ink: "#132A20",
        "ink-soft": "#5C7A6C",
        // основной зелёный (кнопки, активные состояния, акценты)
        pine: "#1CAE6B",
        "pine-light": "#E1F6EA",
        "pine-dark": "#12583A",
        // второй акцентный цвет пути (иконки чётных тем)
        teal: "#16B3A6",
        "teal-light": "#DDF6F3",
        // золото — прогресс-бар, XP-молния, "стрик"
        amber: "#F0A93C",
        "amber-light": "#FCEFD8",
        // сердца/ошибки
        coral: "#F0555A",
        "coral-light": "#FCE4E4",
        // фиолетовый — третий акцент пути
        violet: "#8B6BE0",
        "violet-light": "#EEE8FC",
        grid: "#DCEEE3",
        line: "#D7EAE0",
      },
      fontFamily: {
        display: ["Nunito", "system-ui", "sans-serif"],
        sans: ["Nunito", "system-ui", "sans-serif"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        card: "20px",
        pill: "999px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(19,42,32,0.04), 0 8px 24px -12px rgba(19,42,32,0.12)",
        button: "0 3px 0 0 rgba(0,0,0,0.12)",
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(5px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(3px)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.85)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "pop-in": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "60%": { transform: "scale(1.15)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up-fade": {
          "0%": { transform: "translateY(6px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "grow-x": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" },
        },
        "xp-float": {
          "0%": { transform: "translateY(4px)", opacity: "0" },
          "20%": { transform: "translateY(0)", opacity: "1" },
          "75%": { transform: "translateY(-22px)", opacity: "1" },
          "100%": { transform: "translateY(-30px)", opacity: "0" },
        },
        flash: {
          "0%": { backgroundColor: "rgba(28,174,107,0.35)" },
          "100%": { backgroundColor: "rgba(28,174,107,0)" },
        },
        "mascot-pop": {
          "0%": { transform: "scale(0.7) rotate(-4deg)", opacity: "0" },
          "60%": { transform: "scale(1.08) rotate(2deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        "mascot-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "mascot-orbit": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "node-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(28,174,107,0.4)" },
          "50%": { boxShadow: "0 0 0 10px rgba(28,174,107,0)" },
        },
        "node-check": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "60%": { transform: "scale(1.3)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        shake: "shake 0.4s ease-in-out",
        "scale-in": "scale-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "pop-in": "pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up-fade": "slide-up-fade 0.25s ease-out",
        "grow-x": "grow-x 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        "xp-float": "xp-float 1.1s ease-out forwards",
        flash: "flash 0.6s ease-out",
        "mascot-pop": "mascot-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "mascot-float": "mascot-float 2.6s ease-in-out infinite",
        "mascot-orbit": "mascot-orbit 3s linear infinite",
        "mascot-orbit-slow": "mascot-orbit 14s linear infinite",
        "node-pulse": "node-pulse 2.2s ease-in-out infinite",
        "node-check": "node-check 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
