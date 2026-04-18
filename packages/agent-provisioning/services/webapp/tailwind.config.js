/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        telegram: {
          primary: '#0088cc',
          bg: '#ffffff',
          text: '#000000',
          secondary: '#f5f5f5'
        },
        dark: {
          telegram: {
            primary: '#4fc3f7',
            bg: '#212121',
            text: '#ffffff',
            secondary: '#323232'
          }
        }
      }
    },
  },
  plugins: [],
  darkMode: 'media',
}
