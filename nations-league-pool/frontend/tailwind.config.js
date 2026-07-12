/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        pitch: {
          950: '#07100c',
          900: '#0b1a12',
          800: '#11251a',
          700: '#183324',
          600: '#20422f',
        },
        oranje: {
          300: '#ffb267',
          400: '#ff9a3d',
          500: '#ff7a00',
          600: '#e56a00',
        },
      },
      fontFamily: {
        display: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        pulseLive: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.35 },
        },
      },
      animation: {
        'pulse-live': 'pulseLive 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
