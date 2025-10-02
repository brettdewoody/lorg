/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'retro-space': '#173A2B',
        'retro-panel': '#1E4F39',
        'retro-panel-alt': '#296848',
        'retro-pixel': '#3FD8A6',
        'retro-sun': '#F6DD85',
        'retro-rose': '#F9A6C2',
        'retro-ink': '#F3F2E8',
      },
      boxShadow: {
        'retro-panel': '8px 8px 0 #000000',
        'retro-btn': '4px 4px 0 #000000',
      },
      fontFamily: {
        display: ['"Press Start 2P"', 'monospace'],
        body: ['"VT323"', 'monospace'],
      },
    },
  },
  plugins: [],
}
