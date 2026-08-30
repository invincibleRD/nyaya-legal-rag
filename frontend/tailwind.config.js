export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f6f5f2',
          100: '#e9e6df',
          200: '#d4cec1',
          700: '#3b3a35',
          800: '#26251f',
          900: '#181712',
        },
        brass: {
          400: '#c08a3e',
          500: '#a5722c',
          600: '#87591f',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideIn: {
          from: { transform: 'translateX(12px)', opacity: '0' },
          to: { transform: 'none', opacity: '1' },
        },
        popIn: {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'none' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 200ms ease-out',
        fadeIn: 'fadeIn 150ms ease-out',
        slideIn: 'slideIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        popIn: 'popIn 160ms ease-out',
      },
    },
  },
  plugins: [],
}
