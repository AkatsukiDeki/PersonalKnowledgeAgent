import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Background & Surfaces ──
        'space-void': '#0B0D13',
        'surface-low': '#111520',
        'surface-high': '#181E2E',
        'surface-border': 'rgba(255, 255, 255, 0.08)',

        // ── Entity Palette ──
        'entity-insight': '#F59E0B',
        'entity-decision': '#8B5CF6',
        'entity-claim': '#38BDF8',
        'entity-source': '#64748B',
        'entity-conflict': '#EF4444',
      },
      boxShadow: {
        'glow-insight': '0 0 16px rgba(245, 158, 11, 0.3)',
        'glow-decision': '0 0 16px rgba(139, 92, 246, 0.3)',
        'glow-claim': '0 0 12px rgba(56, 189, 248, 0.2)',
        'glow-source': '0 0 8px rgba(100, 116, 139, 0.15)',
        'glow-conflict': '0 0 16px rgba(239, 68, 68, 0.4)',
      },
      width: {
        'spine-collapsed': '64px',
        'spine-expanded': '220px',
        'orbit': '320px',
      },
      transitionProperty: {
        'width': 'width',
      },
    },
  },
  plugins: [],
};

export default config;