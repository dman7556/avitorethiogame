/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'sky-dark': '#0a0a0f',
        'sky-darker': '#050508',
        'sky-card': '#121218',
        'sky-card-hover': '#1a1a24',
        'sky-border': '#2a2a35',
        'sky-border-light': '#3a3a48',
        'sky-text': '#ffffff',
        'sky-text-secondary': '#8888aa',
        'sky-text-muted': '#555566',
        'sky-green': '#00d26a',
        'sky-green-light': '#00f27a',
        'sky-green-dark': '#00a855',
        'sky-red': '#ff4757',
        'sky-red-light': '#ff6b7a',
        'sky-purple': '#9b59b6',
        'sky-orange': '#ff9f43',
        'sky-blue': '#3498db',
        'sky-yellow': '#f1c40f',
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'monospace'],
        'display': ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 210, 106, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 210, 106, 0.4)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
