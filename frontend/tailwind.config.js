/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        telemetry: {
          canvas: '#080B11',
          card: '#0F141F',
          elevated: '#141B29',
          go: '#10B981',
          caution: '#F59E0B',
          sun: '#F59E0B',
          comms: '#0EA5E9',
          earth: '#0EA5E9',
          nogo: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
