/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fortune: {
          blue: '#0B5FA5',
          blueDark: '#084078',
          blueLight: '#E6F1FA',
          green: '#0B6E4F',
          greenDark: '#054A35',
          greenLight: '#E4F2EC',
          gold: '#E8A33D',
          goldDark: '#B87A1F',
          ink: '#14231E',
          cream: '#F7F5EF',
          terracotta: '#C7492B',
        },
      },
      fontFamily: {
        display: ['"Fraunces"', 'ui-serif', 'Georgia', 'serif'],
        body: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
