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
        'space-void': 'var(--color-space-void)',
        'surface-low': 'var(--color-surface-low)',
        'surface-high': 'var(--color-surface-high)',
        'surface-border': 'var(--color-surface-border)',

        // ── Entity Palette ──
        'entity-insight': 'var(--color-entity-insight)',
        'entity-decision': 'var(--color-entity-decision)',
        'entity-claim': 'var(--color-entity-claim)',
        'entity-source': 'var(--color-entity-source)',
        'entity-timeline': 'var(--color-entity-timeline)',
        'entity-conflict': 'var(--color-entity-conflict)',
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