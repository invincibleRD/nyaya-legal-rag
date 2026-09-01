export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // warm paper greys — a full ramp, so borders can sit a shade off the
        // surface instead of a hard line against it
        ink: {
          50: '#faf9f6',
          100: '#f2efe9',
          200: '#e6e2d8',
          300: '#d3cdbf',
          400: '#b1aa9a',
          500: '#867f71',
          600: '#5d574d',
          700: '#3a3833',
          750: '#2d2c27',
          800: '#232220',
          850: '#1c1b18',
          900: '#161512',
        },
        brass: {
          300: '#d9ad66',
          400: '#c08a3e',
          500: '#a5722c',
          600: '#87591f',
          700: '#6a4416',
        },
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      boxShadow: {
        composer: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)',
        lift: '0 1px 2px rgb(0 0 0 / 0.05), 0 12px 28px -16px rgb(0 0 0 / 0.25)',
        drawer: '-8px 0 32px -16px rgb(0 0 0 / 0.35)',
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        drawerIn: {
          from: { transform: 'translateX(16px)', opacity: '0' },
          to: { transform: 'none', opacity: '1' },
        },
        popIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        caret: { '0%, 45%': { opacity: '1' }, '55%, 100%': { opacity: '0.15' } },
        thinking: {
          '0%, 80%, 100%': { opacity: '0.25', transform: 'translateY(0)' },
          '40%': { opacity: '1', transform: 'translateY(-3px)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        fadeIn: 'fadeIn 160ms ease-out',
        drawerIn: 'drawerIn 240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        popIn: 'popIn 160ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        shimmer: 'shimmer 1.6s linear infinite',
        caret: 'caret 1.1s ease-in-out infinite',
        thinking: 'thinking 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
