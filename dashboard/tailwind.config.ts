import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono:    ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      colors: {
        void:    '#080A0C',
        surface: '#0F1215',
        panel:   '#161A1E',
        border:  '#1E2428',
        muted:   '#3A4048',
        dim:     '#6B7580',
        text:    '#C8D0D8',
        bright:  '#E8EDF2',
        amber:   '#F59E0B',
        'amber-dim': '#92600A',
        green:   '#22C55E',
        red:     '#EF4444',
        blue:    '#3B82F6',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in':    'fadeIn 0.4s ease forwards',
        'slide-up':   'slideUp 0.4s ease forwards',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}

export default config
