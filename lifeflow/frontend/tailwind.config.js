/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0edff',
          100: '#e2d9ff',
          200: '#c5b3ff',
          300: '#a88dff',
          400: '#8b66ff',
          500: '#6C63FF',  // Main brand color
          600: '#5550e0',
          700: '#4440c0',
          800: '#3330a0',
          900: '#222080',
        },
        secondary: {
          500: '#FF6584',
        },
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
        dark: '#1A1A2E',
        surface: '#16213E',
      },
      fontFamily: {
        arabic: ['Cairo', 'Tajawal', 'sans-serif'],
        sans: ['Cairo', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-gentle': 'bounceGentle 2s infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        bounceGentle: { '0%, 100%': { transform: 'translateY(-5px)' }, '50%': { transform: 'translateY(0)' } },
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        'card': '0 4px 24px rgba(108, 99, 255, 0.1)',
        'card-hover': '0 8px 32px rgba(108, 99, 255, 0.2)',
        'glow': '0 0 20px rgba(108, 99, 255, 0.4)',
      },
    },
  },
  plugins: [],
};
