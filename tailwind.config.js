/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        studio: {
          900: '#1a1a1a', // Main bg
          800: '#2b2b2b', // Card bg
          700: '#3d3d3d', // Card hover/border
          600: '#525252', // Secondary text
          500: '#737373',
          accent: '#ffb300', // Ableton-ish yellow/orange
          success: '#10b981', // Green for play
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}